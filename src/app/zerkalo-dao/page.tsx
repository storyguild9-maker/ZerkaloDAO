import Link from "next/link";
import { DaoCard, DaoKicker, DaoPanel } from "@/components/DaoDesign";
import { DaoShell } from "@/components/DaoShell";

export default function ZerkaloDaoPage() {
  return (
    <DaoShell
      eyebrow="Зеркало Дао · MVP v0.1"
      title="Не человек разгадывает загадку. Загадка разгадывает человека."
      subtitle="Семь врат проверяют не IQ, а траекторию внимания: спешку, статус, контроль, правоту, спасательство, неопределённость и желание доступа."
      seal="gate"
    >
      <div className="grid gap-5 text-mist/80 md:grid-cols-3">
        {[
          ["Зеркало", "Система показывает импульс, но не выносит приговор."],
          ["Путь", "Каждое действие фиксируется как часть траектории прохождения."],
          ["Дао", "Мягкость, пауза и мера важнее желания победить тест."]
        ].map(([title, text]) => (
          <DaoCard key={title}>
            <DaoKicker>{title}</DaoKicker>
            <p className="mt-3 leading-7 text-mist/80">{text}</p>
          </DaoCard>
        ))}
      </div>

      <DaoPanel className="mt-7 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <DaoKicker>Порог</DaoKicker>
          <p className="mt-3 max-w-2xl leading-8 text-mist/80">
            Вход начинается без обещаний статуса. Это символический лабиринт самонаблюдения, а не медицинский, психологический или юридический диагноз.
          </p>
        </div>
        <Link href="/consent" className="dao-action px-6 py-3 text-center font-medium">
          Начать путь
        </Link>
      </DaoPanel>
    </DaoShell>
  );
}

