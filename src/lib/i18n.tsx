// Paprasta dvikalbė (LT/RU) sistema. Vertimai raktinami pagal lietuvišką
// pirminį tekstą — jei vertimo nėra, grąžinamas originalus LT tekstas
// (todėl niekas „nesulūžta", net jei kažkas dar neišversta).

import { createContext, useContext, useEffect, useState } from 'react';
import { lt, ru, type Locale } from 'date-fns/locale';

export type Lang = 'lt' | 'ru';

// LT → RU žodynas. Raktas = tikslus lietuviškas tekstas naudotas UI.
const RU: Record<string, string> = {
  // — Navigacija / grupės —
  'Apžvalga': 'Обзор',
  'Operacijos': 'Операции',
  'Katalogas': 'Каталог',
  'Žurnalas': 'Журнал',
  'Skydelis': 'Панель',
  'Planavimas': 'Планирование',
  'Kalendorius': 'Календарь',
  'Grafikas': 'График',
  'Koordinatorius': 'Координатор',
  'Keitimo juodraštis': 'Черновик замены',
  'Kelionė': 'Поездка',
  'Vairuotojai': 'Водители',
  'Automobiliai': 'Автомобили',
  'Istorija': 'История',

  // — Puslapių paantraštės —
  'Bendra parko ir vairuotojų apžvalga': 'Общий обзор автопарка и водителей',
  'Keitimų planavimas ir rekomendacijos': 'Планирование замен и рекомендации',
  'mašinos parke': 'машин в автопарке',
  'Keitimo taškai žemėlapyje — eina į Kelionę': 'Точки замены на карте — идут в Поездку',
  'Visų veiksmų žurnalas': 'Журнал всех действий',
  'Keitimai pagal mėnesį': 'Замены по месяцам',
  'Automobilių užimtumo juosta': 'Лента занятости автомобилей',
  'Maršrutų ir keitimo logistika': 'Логистика маршрутов и замен',
  'Sujunkite mašiną su vairuotoju — patvirtinus keitimas suplanuojamas': 'Соедините машину с водителем — после подтверждения замена планируется',

  // — Keitimo juodraštis —
  'Laisvi vairuotojai': 'Свободные водители',
  'Šią savaitę keičiasi': 'Меняются на этой неделе',
  'Šią savaitę keičiamų mašinų nėra': 'На этой неделе нет машин для замены',
  'Mašinos atsiranda automatiškai, kai vairuotojas grįžta šią savaitę': 'Машины появляются автоматически, когда водитель возвращается на этой неделе',
  'Nutempkite vairuotoją ant mašinos': 'Перетащите водителя на машину',
  'Visi vairuotojai paskirstyti': 'Все водители распределены',
  'Mašinos': 'Машины',
  'Dabar': 'Сейчас',
  'Naujas': 'Новый',
  'Keitimas paruoštas': 'Замена готова',
  'Vilkite čia vairuotoją': 'Перетащите сюда водителя',
  'Peržiūra': 'Предпросмотр',
  'Juodraštyje keitimų nėra': 'В черновике нет замен',
  'Patvirtinti ir suplanuoti': 'Подтвердить и запланировать',
  'Išvalyti juodraštį': 'Очистить черновик',
  'keitimas': 'замена',
  'keitimai': 'замены',
  'Keitimai suplanuoti': 'Замены запланированы',
  'Patvirtinti keitimus?': 'Подтвердить замены?',
  'Taip, suplanuoti': 'Да, запланировать',
  'Šie keitimai bus suplanuoti ir perduoti tolesniems žingsniams:': 'Эти замены будут запланированы и переданы на следующие шаги:',
  'Atšaukti planą?': 'Отменить план?',
  'Taip, atšaukti': 'Да, отменить',
  'Siūloma': 'Рекомендуется',
  'Optimalu': 'Оптимально',
  'Tipas / Įmonė': 'Тип / Компания',
  'Nuima': 'Снимается',
  'Pakeičia': 'Заменяет',
  'vairuotojai': 'водителей',
  'reise': 'в рейсе',
  'namuose': 'дома',

  // — Topbar / sidebar —
  'Vestex Transport': 'Vestex Transport',
  'Automobilis': 'Автомобиль',
  'Vairuotojas': 'Водитель',
  'Supabase debesis': 'Облако Supabase',
  'Vietinė saugykla': 'Локальное хранилище',
  'Atsijungti': 'Выйти',
  'Kalba': 'Язык',

  // — Bendri veiksmai / mygtukai —
  'Pridėti': 'Добавить',
  'Atšaukti': 'Отмена',
  'Išsaugoti': 'Сохранить',
  'Redaguoti': 'Редактировать',
  'Ištrinti': 'Удалить',
  'Uždaryti': 'Закрыть',
  'Importuoti Excel': 'Импорт Excel',
  'Importuoti į sistemą': 'Импортировать в систему',
  'Eksportuoti CSV': 'Экспорт CSV',
  'Eksportuoti visus į CSV': 'Экспортировать всех в CSV',
  'Siųsti el. paštu': 'Отправить по эл. почте',
  'Išvalyti': 'Очистить',
  'Paieška...': 'Поиск...',
  'Kitas failas': 'Другой файл',
  'Pasirinkite Excel failą': 'Выберите файл Excel',

  // — Vaizdų perjungiklis —
  'Lentelė': 'Таблица',
  'Kanban': 'Канбан',
  'Kortelės': 'Карточки',
  'Pagal tipą': 'По типу',

  // — Būsenos —
  'Reise': 'В рейсе',
  'Namuose': 'Дома',
  'Aktyvus': 'Активен',
  'Remontas': 'Ремонт',
  'Laisva': 'Свободна',
  'Užimta': 'Занята',
  'Laisvas': 'Свободен',
  'Vėluoja': 'Опаздывает',
  'Poilsis': 'Отдых',
  'Tvarko dokumentus': 'Оформляет документы',
  'Universalus': 'Универсал',
  'Tentas': 'Тент',
  'Refas': 'Реф',
  'Visos įmonės': 'Все компании',
  'Visi tipai': 'Все типы',
  'Visos registracijos': 'Все регистрации',

  // — Skydelis (dashboard) —
  'Labas rytas': 'Доброе утро',
  'Laba diena': 'Добрый день',
  'Labas vakaras': 'Добрый вечер',
  'skubu': 'срочно',
  'Suplanuoti keitimai': 'Запланированные замены',
  'Šį mėnesį suplanuotų keitimų nėra': 'В этом месяце запланированных замен нет',
  'Savaitė': 'Неделя',
  'Planai': 'Планы',
  'Skubu': 'Срочно',
  'iš': 'из',
  'viso': 'всего',
  'laukia darbo': 'ожидают работы',
  'suplanuota': 'запланировано',
  'reikia keitimo ≤7d': 'нужна замена ≤7д',
  'Vairuotojai namuose': 'Водители дома',
  'Visi vairuotojai reise': 'Все водители в рейсе',
  'Reikia keitimo (≤7 dienų)': 'Нужна замена (≤7 дней)',
  'Vairuotojų grafikas': 'График водителей',
  'grįžta': 'возврат',
  'Liko': 'Осталось',
  'd.': 'дн.',
  'Planuoti': 'Планировать',
  'Skubūs keitimai': 'Срочные замены',
  'Į reisą': 'В рейс',
  'Namo': 'Домой',
  'Siųsti namo': 'Отправить домой',
  'Siųsti į reisą': 'Отправить в рейс',
  'Priskirti vairuotoją': 'Назначить водителя',
  'Priskirti': 'Назначить',
  'Galima': 'Можно',
  'Poilsis iki': 'Отдых до',
  'Grįžta': 'Возврат',
  'Gali': 'Может',
  'dabar': 'сейчас',

  // — Vairuotojų / automobilių lentelės —
  'Įmonė / Tipas': 'Компания / Тип',
  'Įmonė/Tipas': 'Компания/Тип',
  'Būsena': 'Статус',
  'Auto': 'Авто',
  'Data': 'Дата',
  'Veiksmai': 'Действия',
  'Mašina': 'Машина',
  'Reg.': 'Рег.',
  'Keitimas': 'Замена',
  'pasirinkta': 'выбрано',
  'PLANAS': 'ПЛАН',
  'Planas': 'План',

  // — Profilio skydelis —
  'Dabartinė mašina': 'Текущая машина',
  'Reiso pradžia': 'Начало рейса',
  'Numatomas grįžimas': 'Ожидаемый возврат',
  'Namų būsena': 'Статус дома',
  'Laisvas nuo': 'Свободен с',
  'Paskutinio reiso pabaiga': 'Конец последнего рейса',
  'Susiję keitimai': 'Связанные замены',
  'Darbo ir poilsio istorija': 'История работы и отдыха',
  'Dirbo': 'Работал',
  'Ilsėjosi': 'Отдыхал',
  'Dokumentai': 'Документы',
  'Galioja': 'Действует',
  'Asmens kodas': 'Личный код',
  'Paso NR.': '№ паспорта',
  'Tacho šalis': 'Страна тахо',
  'DS Nr.': 'DS №',
  'El. paštas': 'Эл. почта',
  'Pasas': 'Паспорт',
  'Teisės': 'Права',
  '95 kodas': '95 код',
  'Tacho kortelė': 'Карта тахографа',
  'Rožinis lapas': 'Розовый лист',
  'Viza': 'Виза',
  'Dabartinis vairuotojas': 'Текущий водитель',
  'Kas vairavo šią mašiną': 'Кто водил эту машину',
  'Mašina laisva': 'Машина свободна',
  'pasibaigę': 'просрочено',
  'baigiasi': 'истекает',
  'Pasibaigė prieš': 'Истёк',
  'Baigiasi šiandien': 'Истекает сегодня',
  'Dokumentų datų nėra. Importuokite Excel sąrašą.': 'Дат документов нет. Импортируйте список из Excel.',
  'Mašinų istorija': 'История машин',
  'Nėra priskyrimų': 'Нет назначений',

  // — Importo langas —
  'Importuoti vairuotojų sąrašą': 'Импорт списка водителей',
  'Importuoti automobilių sąrašą': 'Импорт списка автомобилей',
  'Excel (.xlsx / .xls) arba .csv · duomenys atsinaujins sistemoje': 'Excel (.xlsx / .xls) или .csv · данные обновятся в системе',
  'Nežinote formato? Atsisiųskite pavyzdį': 'Не знаете формат? Скачайте образец',
  'Nežinote formato? Atsisiųskite pavyzdį.': 'Не знаете формат? Скачайте образец.',
  'LT įmonės šablonas': 'Шаблон LT компании',
  'PL įmonės šablonas': 'Шаблон PL компании',
  'Automobilių šablonas': 'Шаблон автомобилей',
  'nauji': 'новые',
  'atnaujinami': 'обновляются',
  'eilutės': 'строк',
  'Markė': 'Марка',
  'Tipas': 'Тип',
  'Metai': 'Год',
  'Tacho': 'Тахо',
  'Stulpeliai atpažįstami automatiškai: Pavardė, Vardas, Tel, Paso galiojimo data, Teisių galiojimas, 95 kodo, Tacho kortelės, LLGL / Viza, ADR, Asmens kodas…': 'Столбцы распознаются автоматически: Фамилия, Имя, Тел, Срок паспорта, Срок прав, 95 код, Карта тахо, LLGL / Виза, ADR, Личный код…',
  'LT ir PL įmonių dokumentai skiriasi: LT — LLGL, PL — Viza; abiem — ADR. Užpildykite šabloną ir įkelkite.': 'Документы компаний LT и PL отличаются: LT — LLGL, PL — Виза; для обеих — ADR. Заполните шаблон и загрузите.',
  'Atitikimas pagal Asmens kodą (jei nėra — DS numerį, tada vardą+pavardę). Esami vairuotojai atnaujinami, nauji — pridedami. Reiso būsenos ir istorija nekeičiamos.': 'Сопоставление по личному коду (если нет — по № DS, затем по имени и фамилии). Существующие водители обновляются, новые — добавляются. Статусы рейсов и история не меняются.',
  'Rodoma 60 iš': 'Показано 60 из',
  'Rodoma 80 iš': 'Показано 80 из',
  'Importuojami visi.': 'Импортируются все.',
  // — Automobilių importas —
  'Stulpeliai atpažįstami automatiškai: Mašinos nr, Markė, Ref/Tent, Gamybos metai, Registracija.': 'Столбцы распознаются автоматически: № машины, Марка, Реф/Тент, Год выпуска, Регистрация.',
  'Užpildykite šabloną (Mašinos nr · Markė · Ref/Tent · Gamybos metai) ir įkelkite atgal.': 'Заполните шаблон (№ машины · Марка · Реф/Тент · Год выпуска) и загрузите обратно.',
  'Atitikimas pagal Mašinos nr. Esami automobiliai atnaujinami, nauji — pridedami (būsena „Aktyvus"). Vairuotojų priskyrimai nekeičiami.': 'Сопоставление по № машины. Существующие автомобили обновляются, новые — добавляются (статус «Активен»). Назначения водителей не меняются.',
  'Mašinos nr': '№ машины',
  'Faile nerasta automobilių. Patikrinkite stulpelį „Mašinos nr".': 'В файле не найдено автомобилей. Проверьте столбец «№ машины».',

  // — Modalai —
  'Naujas vairuotojas': 'Новый водитель',
  'Naujas automobilis': 'Новый автомобиль',
  'Redaguoti vairuotoją': 'Редактировать водителя',
  'Redaguoti automobilį': 'Редактировать автомобиль',
  'Vardas Pavardė': 'Имя Фамилия',
  'Telefonas': 'Телефон',
  'Įmonė': 'Компания',
  'Tipas (specializacija)': 'Тип (специализация)',
  'Numeris': 'Номер',
  'Registracija': 'Регистрация',
  'Gamybos metai': 'Год выпуска',
  'Aktyvus nuo': 'Активен с',
  'Pradžia': 'Начало',
  'Planuojama pabaiga': 'Планируемое окончание',
  'Pasirinkite...': 'Выберите...',
  'Būsena namuose': 'Статус дома',
  'Gali nuo': 'Готов с',
  'Vardas': 'Имя',
  'Tel.': 'Тел.',
  'Nėra': 'Нет',
  'Duomenys atnaujinti': 'Данные обновлены',

  // — Istorija —
  'Veiksmų žurnalas': 'Журнал действий',
  'Nėra įrašų': 'Нет записей',

  // — Rolės / teisės —
  'Neturite teisių atlikti šį veiksmą': 'У вас нет прав на это действие',
  'Keitimų vadybininkas': 'Менеджер замен',
  'Transporto vadybininkas': 'Менеджер транспорта',
  'Rolė': 'Роль',
  'Tik stebėjimas — redaguoti negalite': 'Только просмотр — редактирование недоступно',
  'Redaguoti galite tik Koordinatoriaus skiltyje': 'Редактировать можно только в разделе Координатор',
  'Vartotojų rolės': 'Роли пользователей',
  'Priskirti rolę': 'Назначить роль',
  'Vartotojo el. paštas': 'Эл. почта пользователя',
  'Rolė priskirta': 'Роль назначена',
  'Pasirinkite rolę': 'Выберите роль',
  'Tvarkyti roles': 'Управление ролями',
  'Rolė rišama prie paskyros; vartotojas jos pats pakeisti negali.': 'Роль привязана к аккаунту; пользователь сам её изменить не может.',
  'Kūrėjas': 'Создатель',
  'Kūrėjo prieiga': 'Доступ создателя',
  'Kūrėjo kodas': 'Код создателя',
  'Įjungti Kūrėjo režimą': 'Включить режим создателя',
  'Išjungti Kūrėjo režimą': 'Выключить режим создателя',
  'Kūrėjo režimas įjungtas': 'Режим создателя включён',
  'Kūrėjo režimas išjungtas': 'Режим создателя выключен',
  'Neteisingas kodas': 'Неверный код',
  'Kūrėjo rolė suteikia pilną prieigą prie visų pakeitimų, rolių valdymo ir sistemos atstatymo.': 'Роль создателя даёт полный доступ ко всем изменениям, управлению ролями и сбросу системы.',

  // — Tuščios būsenos —
  'Nėra duomenų': 'Нет данных',
  'Nieko nerasta': 'Ничего не найдено',

  // — Automobilių skiltis —
  'Visi automobiliai': 'Все автомобили',
  'Tentai': 'Тенты',
  'Refai': 'Рефы',

  // — Modalų laukai / mygtukai —
  'Atnaujinti': 'Обновить',
  'Pamaina': 'Пересменка',
  'Atlikti': 'Выполнить',
  'Atlikta': 'Выполнено',
  'Suplanuota': 'Запланировано',
  'Patvirtinti': 'Подтвердить',
  'Keitimo data': 'Дата замены',
  'Naujas grįžimo terminas': 'Новый срок возврата',
  'Įvykdyti keitimą': 'Выполнить замену',
  'Atšaukti įvykdymą': 'Отменить выполнение',
};

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; }
const Ctx = createContext<LangCtx>({ lang: 'lt', setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem('dispo_lang') : null;
    return s === 'ru' ? 'ru' : 'lt';
  });
  useEffect(() => {
    try { localStorage.setItem('dispo_lang', lang); } catch { /* ignore */ }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

// Vertimo funkcija. LT režimu grąžina originalą; RU režimu — vertimą arba originalą.
export function useT() {
  const { lang } = useLang();
  return (s: string) => (lang === 'ru' ? (RU[s] ?? s) : s);
}

// date-fns lokalė pagal pasirinktą kalbą (datų/mėnesių pavadinimams).
export function useDateLocale(): Locale {
  const { lang } = useLang();
  return lang === 'ru' ? ru : lt;
}
