import Link from "next/link";

const initiates = [
  {
    title: "Хранитель Ясности",
    direction: "Север",
    gender: "мужчина",
    image: "/images/initiates/north-keeper-clarity-cutout.png",
    cyberImage: "/images/initiates/north-keeper-clarity-cyber-cutout.png",
    role: "Знание, чистота решения, холодный свет.",
    next: "3D: спокойное дыхание, медленный поворот, жест принятия решения.",
  },
  {
    title: "Провидец Рассвета",
    direction: "Восток",
    gender: "мужчина",
    image: "/images/initiates/east-seer-dawn-cutout.png",
    cyberImage: "/images/initiates/east-seer-dawn-cyber-cutout.png",
    role: "Начало, видение, восходящий импульс.",
    next: "3D: приветственный жест, мягкое движение ткани, шаг вперед.",
  },
  {
    title: "Оракул Сферы",
    direction: "Северо-запад",
    gender: "мужчина",
    image: "/images/initiates/north-west-oracle-sphere-cutout.png",
    cyberImage: "/images/initiates/north-west-oracle-sphere-cyber-cutout.png",
    role: "Связь, воздух, обмен, магический шар.",
    next: "3D: шар как отдельный prop, idle с вращением сферы и частицами.",
  },
  {
    title: "Страж Основания",
    direction: "Юго-запад",
    gender: "мужчина",
    image: "/images/initiates/south-west-guardian-foundation-cutout.png",
    cyberImage: "/images/initiates/south-west-guardian-foundation-cyber-cutout.png",
    role: "Устойчивость, граница, защита структуры.",
    next: "3D: grounded idle, стойка хранителя, тяжелая мантия.",
  },
  {
    title: "Хранительница Истока",
    direction: "Северо-восток",
    gender: "женщина",
    image: "/images/initiates/north-east-keeper-source-cutout.png",
    cyberImage: "/images/initiates/north-east-keeper-source-cyber-cutout.png",
    role: "Исток, чистая вода, тонкая священная зона.",
    next: "3D: мягкое дыхание, водно-световая аура, спокойный жест.",
  },
  {
    title: "Архитектор Пламени",
    direction: "Юг",
    gender: "женщина",
    image: "/images/initiates/south-flame-architect-cutout.png",
    cyberImage: "/images/initiates/south-flame-architect-cyber-cutout.png",
    role: "Воля, форма, дисциплина огня.",
    next: "3D: сдержанный жест огня, световые контуры, уверенная стойка.",
  },
  {
    title: "Архивариус Памяти",
    direction: "Запад",
    gender: "женщина",
    image: "/images/initiates/west-archivist-memory-cutout.png",
    cyberImage: "/images/initiates/west-archivist-memory-cyber-cutout.png",
    role: "Память, архив, внутренняя глубина.",
    next: "3D: свиток или книга как prop, тихая idle-анимация.",
  },
  {
    title: "Алхимик Сияния",
    direction: "Юго-восток",
    gender: "женщина",
    image: "/images/initiates/south-east-alchemist-radiance-cutout.png",
    cyberImage: "/images/initiates/south-east-alchemist-radiance-cyber-cutout.png",
    role: "Трансформация, точность, сияние энергии.",
    next: "3D: алхимический свет, мягкая пульсация орнаментов.",
  },
];

export default function InitiatesPage() {
  return (
    <section className="initiates-page">
      <header className="initiates-page__topbar">
        <div>
          <p className="dao-kicker">Аватары / посвященные</p>
          <h1>Посвященные и кибер-аугментации</h1>
        </div>
        <nav aria-label="Навигация посвященных">
          <Link href="/assembled-room">Комната</Link>
          <Link href="/animate">Оживить</Link>
          <Link href="/optimization">Оптимизация</Link>
          <Link href="/inner">Конструктор</Link>
        </nav>
      </header>

      <div className="initiates-page__grid">
        {initiates.map((item) => (
          <article className="initiate-card" key={item.title}>
            <div className="initiate-card__duo">
              <div className="initiate-card__image">
                <img alt={`${item.title}: храмовая версия`} src={item.image} />
                <span>Храм</span>
              </div>
              <div className="initiate-card__image">
                <img alt={`${item.title}: кибер-аугментация`} src={item.cyberImage} />
                <span>Кибер</span>
              </div>
            </div>
            <div className="initiate-card__body">
              <p className="dao-kicker">
                {item.direction} / {item.gender}
              </p>
              <h2>{item.title}</h2>
              <p>{item.role}</p>
              <small>{item.next}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}



