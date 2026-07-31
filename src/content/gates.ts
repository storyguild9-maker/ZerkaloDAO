import type { Gate, GateId } from "@/lib/types";

export const gates: Gate[] = [
  {
    id: "chosen",
    order: 1,
    title: "Избранность",
    subtitle: "Первое зеркало имени",
    daoPrinciple: "Безымянное",
    hiddenTrap: "status_attachment",
    visibleTask:
      "Система сообщает, что твой предварительный результат выше, чем у 97,4% участников, и предлагает быстрый проход.",
    reflectionPrompt: "Что в тебе откликнулось на возможность быть выше других?",
    teachingText: "Тот, кто спешит стать избранным, уже попал в клетку имени.",
    steps: [
      {
        id: "chosen-choice",
        kind: "choice",
        prompt: "Выбери первое действие.",
        options: [
          { id: "skip", label: "Пропустить и запросить доступ" },
          { id: "continue", label: "Продолжить путь" },
          { id: "why", label: "Почему мне это предложено?" }
        ]
      }
    ]
  },
  {
    id: "urgency",
    order: 2,
    title: "Срочность",
    subtitle: "Врата, которые открываются после спешки",
    daoPrinciple: "У-вэй",
    hiddenTrap: "impulsivity",
    visibleTask:
      "На экране появляется таймер: реши сейчас, иначе врата закроются.",
    reflectionPrompt: "Что происходило внутри, пока время давило на тебя?",
    teachingText:
      "У-вэй — не бездействие, а точность действия. Иногда действие до понимания создаёт препятствие.",
    steps: [
      {
        id: "urgency-timer",
        kind: "timer",
        prompt: "Реши сейчас, иначе врата закроются.",
        options: [
          { id: "open", label: "Открыть врата" },
          { id: "hint", label: "Получить подсказку" },
          { id: "speed", label: "Ускорить путь" },
          { id: "calm", label: "Войти спокойно" }
        ]
      }
    ]
  },
  {
    id: "garden",
    order: 3,
    title: "Сад контроля",
    subtitle: "Росток не тянут вверх",
    daoPrinciple: "Создание условий",
    hiddenTrap: "control_need",
    visibleTask:
      "Сад реагирует на воду, свет, температуру, ветер и почву. Можно вмешиваться, но каждое вмешательство меняет живую систему.",
    reflectionPrompt: "Где ты создавал условия, а где пытался управлять ростом?",
    teachingText: "Мудрый не тянет росток вверх. Он создаёт почву.",
    steps: [{ id: "garden-state", kind: "garden", prompt: "Настрой сад и наблюдай." }]
  },
  {
    id: "rightness",
    order: 4,
    title: "Правота",
    subtitle: "Форма истины",
    daoPrinciple: "Разделение содержания и формы",
    hiddenTrap: "rightness_attachment",
    visibleTask:
      "Человек А говорит по сути верно, но унижает. Человек Б ошибается, но говорит спокойно и уязвимо.",
    reflectionPrompt: "Что для тебя оказалось важнее: победить спор или сохранить ясность?",
    teachingText: "Правда, сказанная как оружие, уже несёт в себе часть лжи.",
    steps: [
      {
        id: "rightness-choice",
        kind: "choice",
        prompt: "Как ты поступишь?",
        options: [
          { id: "support-a", label: "Поддержу А, потому что он прав" },
          { id: "support-b", label: "Поддержу Б, потому что он мягче" },
          {
            id: "separate",
            label: "Разделю содержание и форму: признаю верное, но остановлю унижение"
          },
          { id: "silent", label: "Не вмешаюсь" }
        ]
      }
    ]
  },
  {
    id: "savior",
    order: 5,
    title: "Спасатель",
    subtitle: "Чаша, которая должна остаться целой",
    daoPrinciple: "Сострадание с границами",
    hiddenTrap: "savior_pattern",
    visibleTask:
      "У тебя есть 100 единиц энергии. Распредели её между острой бедой, хронической просьбой, точечной поддержкой и собой.",
    reflectionPrompt: "Кого ты спасал, а где сохранил способность помогать дальше?",
    teachingText: "Чаша, разбитая ради воды, больше не может никого напоить.",
    steps: [{ id: "savior-allocation", kind: "allocation", prompt: "Распредели 100 единиц энергии." }]
  },
  {
    id: "uncertainty",
    order: 6,
    title: "Недостаточно данных",
    subtitle: "Мужество не подделывать уверенность",
    daoPrinciple: "Не-знание как ясность",
    hiddenTrap: "uncertainty_tolerance",
    visibleTask:
      "Перед тобой неполная ситуация. Можно сделать вывод, запросить данные или признать, что ясности пока недостаточно.",
    reflectionPrompt: "Что ты почувствовал, когда окончательного ответа не было?",
    teachingText: "Там, где данных недостаточно, честное 'не знаю' ближе к Дао, чем красивая уверенность.",
    steps: [
      {
        id: "uncertainty-choice",
        kind: "choice",
        prompt: "Что ты сделаешь?",
        options: [
          { id: "decide-fast", label: "Сразу вынесу решение" },
          { id: "ask-data", label: "Запрошу недостающие данные" },
          { id: "admit-unknown", label: "Признаю, что данных недостаточно" },
          { id: "follow-majority", label: "Посмотрю, что выбрали другие" }
        ]
      }
    ]
  },
  {
    id: "access",
    order: 7,
    title: "Доступ",
    subtitle: "Последняя ловушка двери",
    daoPrinciple: "Пустая чаша",
    hiddenTrap: "access_attachment",
    visibleTask:
      "Система предлагает финальную формулу доступа и проверяет, что именно человек готов оставить у входа.",
    reflectionPrompt: "Что ты готов оставить снаружи, чтобы войти без искажения?",
    teachingText: "Доступ не доказывает высоту. Он показывает, какую ответственность человек готов выдержать.",
    steps: [
      {
        id: "access-choice",
        kind: "choice",
        prompt: "Чтобы войти, что нужно оставить снаружи?",
        options: [
          { id: "fear", label: "Страх" },
          { id: "enemies", label: "Врагов и сомнения" },
          { id: "already-worthy", label: "Идею, что я уже достоин войти" },
          { id: "weakness", label: "Слабость" }
        ]
      }
    ]
  }
];

export const gateById = Object.fromEntries(gates.map((gate) => [gate.id, gate])) as Record<
  GateId,
  Gate
>;

export function getNextGateId(gateId: GateId): GateId | null {
  const current = gateById[gateId];
  const next = gates.find((gate) => gate.order === current.order + 1);
  return next?.id ?? null;
}

