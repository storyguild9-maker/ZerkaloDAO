import { DaoKicker, DaoPanel } from "@/components/DaoDesign";
import { DaoShell } from "@/components/DaoShell";

export default function ConsentPage() {
  return (
    <DaoShell
      eyebrow="Согласие"
      title="Вход возможен только как добровольное зеркало"
      subtitle="Приложение собирает анонимные поведенческие события внутри прохождения, чтобы построить символический профиль самонаблюдения."
      seal="mirror"
    >
      <form action="/api/sessions" method="post" className="space-y-5">
        <DaoPanel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <DaoKicker>Условия входа</DaoKicker>
              <p className="mt-3 max-w-2xl leading-7 text-mist/75">Порог открыт только для добровольного прохождения: без обещания статуса, диагноза или внешней оценки.</p>
            </div>
            <div className="dao-stat px-4 py-3 text-right">
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gold/60">Пунктов</p>
              <p className="mt-1 text-2xl font-semibold text-white">4</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {[
              "Я понимаю, что это не медицинский тест и не психологический диагноз.",
              "Я согласен на обработку анонимных поведенческих данных внутри приложения.",
              "Я понимаю, что система может показать мне неприятное зеркало.",
              "Я могу прекратить прохождение в любой момент."
            ].map((label, index) => (
              <label key={label} className="dao-check flex gap-3 p-4">
                <input required name={`consent-${index}`} type="checkbox" />
                <span className="leading-7 text-mist/85">{label}</span>
              </label>
            ))}
          </div>
        </DaoPanel>
        <button className="dao-action w-full px-6 py-3 font-medium sm:w-auto">Войти в первые врата</button>
      </form>
    </DaoShell>
  );
}
