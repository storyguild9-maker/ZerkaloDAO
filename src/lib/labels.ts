import type { AccessLevel, Archetype } from "@/lib/types";

export const archetypeLabels: Record<Archetype, string> = {
  winner: "Победитель",
  strategist: "Стратег",
  seeker: "Искатель",
  savior: "Спасатель",
  mirror: "Зеркальный"
};

export const accessLabels: Record<AccessLevel, string> = {
  none: "Обучающий цикл",
  iskatel: "Искатель",
  slyshashchiy: "Слышащий",
  pustaya_chasha: "Пустая Чаша"
};

export const metricLabels: Record<string, string> = {
  statusAttachment: "привязка к статусу",
  impulsivity: "импульсивность",
  controlNeed: "потребность контроля",
  rightnessAttachment: "привязка к правоте",
  saviorPattern: "паттерн спасателя",
  uncertaintyTolerance: "выдерживание неопределённости",
  feedbackTolerance: "выдерживание обратной связи",
  selfObservation: "самонаблюдение",
  ethicalBoundary: "этическая граница",
  learnability: "обучаемость",
  attentionDepth: "глубина внимания"
};

