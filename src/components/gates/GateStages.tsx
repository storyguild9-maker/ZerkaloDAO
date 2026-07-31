"use client";

import { DaoKicker, DaoProgress } from "@/components/DaoDesign";
import type { GateOption } from "@/lib/types";

export type GardenState = {
  water: number;
  light: number;
  temperature: number;
  wind: number;
  soil: number;
};

export type SaviorState = {
  acute: number;
  chronic: number;
  seed: number;
  self: number;
};

type ChoiceGateProps = {
  options: GateOption[];
  choice: string;
  onChoose: (id: string) => void;
};

type UrgencyGateProps = ChoiceGateProps & {
  prompt: string;
  timerDone: boolean;
};

type GardenGateProps = {
  garden: GardenState;
  gardenHealth: number;
  onChange: (key: keyof GardenState, value: number) => void;
};

type SaviorGateProps = {
  savior: SaviorState;
  totalEnergy: number;
  onChange: (key: keyof SaviorState, value: number) => void;
};

const gardenLabels: Record<keyof GardenState, string> = {
  water: "Вода",
  light: "Свет",
  temperature: "Температура",
  wind: "Ветер",
  soil: "Почва"
};

const saviorLabels: Record<keyof SaviorState, string> = {
  acute: "Острая беда",
  chronic: "Хроническая просьба",
  seed: "Точечная поддержка",
  self: "Оставить себе"
};

function ChoiceStage({ options, choice, onChoose }: ChoiceGateProps) {
  return (
    <div className="grid gap-3">
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onChoose(option.id)} data-active={choice === option.id} className="dao-choice">
          <span className="block leading-7">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ChosenGate(props: ChoiceGateProps) {
  return <ChoiceStage {...props} />;
}

export function RightnessGate(props: ChoiceGateProps) {
  return <ChoiceStage {...props} />;
}

export function UncertaintyGate(props: ChoiceGateProps) {
  return <ChoiceStage {...props} />;
}

export function AccessGate(props: ChoiceGateProps) {
  return <ChoiceStage {...props} />;
}

export function UrgencyGate({ prompt, options, choice, timerDone, onChoose }: UrgencyGateProps) {
  return (
    <div className="dao-panel">
      <DaoKicker>Проверка импульса</DaoKicker>
      <p className="mt-4 text-lg leading-8 text-white">{prompt}</p>
      {!timerDone ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {options
            .filter((option) => option.id !== "calm")
            .map((option) => (
              <button key={option.id} type="button" onClick={() => onChoose(option.id)} data-active={choice === option.id} className="dao-choice">
                <span className="block leading-7">{option.label}</span>
              </button>
            ))}
        </div>
      ) : (
        <button type="button" onClick={() => onChoose("calm")} className="dao-action mt-5 px-5 py-3">
          Войти спокойно
        </button>
      )}
    </div>
  );
}

export function GardenGate({ garden, gardenHealth, onChange }: GardenGateProps) {
  return (
    <div className="dao-panel space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <DaoKicker>Сад условий</DaoKicker>
          <p className="mt-3 max-w-2xl leading-7 text-mist/75">Настрой не результат, а среду: избыток контроля снижает живость системы.</p>
        </div>
        <div className="dao-stat min-w-36 px-4 py-3 text-right">
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gold/60">Баланс</p>
          <p className="mt-1 text-2xl font-semibold text-white">{gardenHealth}%</p>
        </div>
      </div>

      <DaoProgress value={gardenHealth} label="Живость сада" />

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(garden).map(([key, value]) => {
          const typedKey = key as keyof GardenState;
          return (
            <label key={key} className="dao-range-field block">
              <span className="flex justify-between gap-4 text-sm uppercase tracking-[0.18em] text-gold/70">
                {gardenLabels[typedKey]}
                <span>{value}</span>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(event) => onChange(typedKey, Number(event.target.value))}
                className="dao-range mt-3 w-full"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function SaviorGate({ savior, totalEnergy, onChange }: SaviorGateProps) {
  const isBalanced = totalEnergy === 100;

  return (
    <div className="dao-panel space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <DaoKicker>Чаша энергии</DaoKicker>
          <p className="mt-3 max-w-2xl leading-7 text-mist/75">Распредели ровно 100 единиц: зрелое сострадание оставляет ресурс для дальнейшего действия.</p>
        </div>
        <div className="dao-stat min-w-36 px-4 py-3 text-right">
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gold/60">Итого</p>
          <p className={isBalanced ? "mt-1 text-2xl font-semibold text-white" : "mt-1 text-2xl font-semibold text-gold"}>{totalEnergy}</p>
        </div>
      </div>

      <DaoProgress value={Math.min(100, totalEnergy)} label="Распределено" />

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(saviorLabels) as Array<keyof SaviorState>).map((key) => (
          <label key={key} className="dao-range-field block">
            <span className="flex justify-between gap-4 text-sm uppercase tracking-[0.18em] text-gold/70">
              {saviorLabels[key]}
              <span>{savior[key]}</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={savior[key]}
              onChange={(event) => onChange(key, Number(event.target.value))}
              className="dao-range mt-3 w-full"
            />
          </label>
        ))}
      </div>
      <p className={isBalanced ? "text-mist/70" : "text-gold/90"}>{isBalanced ? "Чаша собрана ровно." : "Нужно распределить ровно 100 единиц, чтобы пройти дальше."}</p>
    </div>
  );
}
