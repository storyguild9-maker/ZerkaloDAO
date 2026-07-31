import Link from "next/link";

const generated2dAssets = [
  {
    title: "Дальняя витражная стена",
    image: "/images/optimization/temple-2d-replacement-panels-v2.png",
    quadrant: "верхний левый сектор листа",
    usage: "Плоскость-билборд на задней и боковых стенах, с легкой эмиссией и параллаксом.",
    replaces: [
      ["87-stained-glass-lancet-panel", "/models/meshy/generated/87-stained-glass-lancet-panel.glb"],
      ["150-gothic-jade-window-panel", "/models/meshy/generated/150-gothic-jade-window-panel.glb"],
      ["208-arched-window-tracery-insert", "/models/meshy/generated/208-arched-window-tracery-insert.glb"],
      ["234-distant-mountain-window-insert", "/models/meshy/generated/234-distant-mountain-window-insert.glb"],
    ],
  },
  {
    title: "Ботаническая ниша и зелень",
    image: "/images/optimization/temple-2d-replacement-panels-v2.png",
    quadrant: "верхний правый сектор листа",
    usage: "2D-слой для дальних растений, лиан и декоративных ниш, которые не требуют обхода камерой.",
    replaces: [
      ["142-living-vine-arch", "/models/meshy/generated/142-living-vine-arch.glb"],
      ["151-hanging-vine-curtain", "/models/meshy/generated/151-hanging-vine-curtain.glb"],
      ["164-sacred-indoor-tree-planter", "/models/meshy/generated/164-sacred-indoor-tree-planter.glb"],
      ["195-botanical-planter-cluster", "/models/meshy/generated/195-botanical-planter-cluster.glb"],
    ],
  },
  {
    title: "Вода как легкий визуальный слой",
    image: "/images/optimization/temple-2d-replacement-panels-v2.png",
    quadrant: "нижний левый сектор листа",
    usage: "Анимированная плоскость: normal-map, прозрачность, мягкое свечение и отражение без тяжелой геометрии.",
    replaces: [
      ["88-marble-gold-side-waterfall-feature", "/models/meshy/generated/88-marble-gold-side-waterfall-feature.glb"],
      ["172-reflective-water-plane-tile", "/models/meshy/generated/172-reflective-water-plane-tile.glb"],
      ["193-shallow-water-ripple-plate", "/models/meshy/generated/193-shallow-water-ripple-plate.glb"],
      ["202-water-channel-lip-falling-sheet", "/models/meshy/generated/202-water-channel-lip-falling-sheet.glb"],
    ],
  },
  {
    title: "Потолочная мандала и дальний орнамент",
    image: "/images/optimization/temple-2d-replacement-panels-v2.png",
    quadrant: "нижний правый сектор листа",
    usage: "Текстурный потолочный слой для дальних зон, где рельеф читается только силуэтом и бликом.",
    replaces: [
      ["180-ceiling-dome-cap-module", "/models/meshy/generated/180-ceiling-dome-cap-module.glb"],
      ["228-vaulted-ceiling-wedge-panel", "/models/meshy/generated/228-vaulted-ceiling-wedge-panel.glb"],
      ["241-white-gold-vaulted-ceiling-bay-kit", "/models/meshy/generated/241-white-gold-vaulted-ceiling-bay-kit.glb"],
      ["240-white-gold-corner-connector-kit", "/models/meshy/generated/240-white-gold-corner-connector-kit.glb"],
    ],
  },
];

const keep3dModels = [
  ["82-council-round-marble-gold-table", "/models/meshy/generated/82-council-round-marble-gold-table.glb", "центр сцены, рядом с камерой"],
  ["92-council-chair-v2", "/models/meshy/generated/92-council-chair-v2.glb", "места участников и аватары"],
  ["238-white-gold-modular-column-kit", "/models/meshy/generated/238-white-gold-modular-column-kit.glb", "несущие колонны первого плана"],
  ["239-white-gold-gothic-wall-bay-kit", "/models/meshy/generated/239-white-gold-gothic-wall-bay-kit.glb", "главные стены и арки"],
  ["106-inner-temple-doorway-portal", "/models/meshy/generated/106-inner-temple-doorway-portal.glb", "входной портал"],
  ["140-reflective-water-bowl", "/models/meshy/generated/140-reflective-water-bowl.glb", "физическая чаша без симуляции воды"],
];

const steps = [
  "Сначала заменить дальние стены, витражи, растения и потолочный узор на 2D-плоскости.",
  "Оставить в 3D только то, что пользователь может обойти, выбрать или увидеть рядом с аватаром.",
  "Для воды использовать shader-plane: движение бликов и normal-map вместо тяжелых водных GLB.",
  "Сделать отдельный пресет оптимизированной сцены, чтобы текущий сохраненный шаблон оставался точкой возврата.",
];

export default function OptimizationPage() {
  return (
    <section className="optimization-page">
      <header className="optimization-page__topbar">
        <div>
          <p className="dao-kicker">Сцена / вес / 2D + 3D</p>
          <h1>Гибридная оптимизация зала</h1>
        </div>
        <nav aria-label="Навигация оптимизации">
          <Link href="/inner">Зал</Link>
          <Link href="/assembled-room">Собранная комната</Link>
          <Link href="/space">Пространство</Link>
        </nav>
      </header>

      <div className="optimization-page__layout">
        <section className="optimization-page__hero">
          <div>
            <p className="dao-kicker">2D вместо тяжелых дальних GLB</p>
            <h2>Сохраняем ощущение храма, но разгружаем сцену для телефонов и слабых компьютеров.</h2>
            <p>
              Смысл не в том, чтобы сделать зал плоским. Центральный стол, кресла, аватары, ближайшие колонны и главные арки остаются объемными.
              Дальние витражи, зелень, водные эффекты и потолочная детализация переходят в художественные 2D-слои, которые визуально держат роскошь, но почти не грузят видеокарту.
            </p>
          </div>
          <div className="optimization-page__stats" aria-label="Оценка веса сцены">
            <span><strong>359 MB</strong> текущие уникальные GLB</span>
            <span><strong>144 MB</strong> первый слой кандидатов в 2D</span>
            <span><strong>215 MB</strong> ориентир после первого среза</span>
          </div>
        </section>

        <section className="optimization-page__preview optimization-page__preview--split">
          <div>
            <p className="dao-kicker">Новый 2D-лист</p>
            <h2>Четыре плоских слоя для замены тяжелого дальнего декора</h2>
            <p>
              Этот лист уже лежит в проекте и подключен к вкладке. Его можно дальше нарезать на отдельные текстуры: стена, зелень, вода, потолок.
            </p>
            <a href="/images/optimization/temple-2d-replacement-panels-v2.png" target="_blank" rel="noreferrer">Открыть 2D PNG</a>
          </div>
          <img alt="2D-слои для оптимизации храма: витражи, зелень, вода и потолочная мандала" src="/images/optimization/temple-2d-replacement-panels-v2.png" />
        </section>

        <section className="optimization-page__asset-grid" aria-label="2D слои и 3D модели для замены">
          {generated2dAssets.map((asset) => (
            <article className="optimization-asset-card" key={asset.title}>
              <div className="optimization-asset-card__image">
                <img alt={asset.title} src={asset.image} />
              </div>
              <div>
                <p className="dao-kicker">{asset.quadrant}</p>
                <h3>{asset.title}</h3>
                <p>{asset.usage}</p>
                <h4>Разгружает 3D-модели</h4>
                <ul>
                  {asset.replaces.map(([name, model]) => (
                    <li key={name}>
                      <span>{name}</span>
                      <a href={model} target="_blank" rel="noreferrer">GLB</a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>

        <section className="optimization-page__model-grid">
          <div className="optimization-page__model-panel">
            <p className="dao-kicker">Оставить объемным</p>
            <h2>3D-ядро сцены</h2>
            <p>Эти модели должны оставаться настоящей геометрией, потому что рядом с ними будут камера, аватары и действия пользователя.</p>
            <ul>
              {keep3dModels.map(([name, model, reason]) => (
                <li key={name}>
                  <span><strong>{name}</strong><small>{reason}</small></span>
                  <a href={model} target="_blank" rel="noreferrer">GLB</a>
                </li>
              ))}
            </ul>
          </div>
          <div className="optimization-page__model-panel">
            <p className="dao-kicker">Порядок внедрения</p>
            <h2>Как собирать без развала шаблона</h2>
            <ol>
              {steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        </section>
      </div>
    </section>
  );
}


