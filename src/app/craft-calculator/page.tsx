import { ModulePage } from "@/components/module-page";
import { Calculator } from "lucide-react";

export default function CraftCalculatorPage() {
  return (
    <ModulePage
      eyebrow="Инструменты · Планирование"
      title="Калькулятор крафта"
      description="Разложите предмет на все уровни компонентов и сразу увидите, что есть в банках клана, а чего не хватает."
      features={["Расчёт для заданного количества", "Многоуровневые вложенные рецепты", "Сравнение с балансом клана", "Исключение собственных материалов", "Создание заявки из результата"]}
    >
      <div className="calculator-preview">
        <div className="calculator-input"><Calculator size={19} /><div><small>Что хотите создать?</small><strong>Выберите предмет</strong></div><span>1 шт.</span></div>
        <div className="formula-line"><span className="formula-node formula-node--main">?</span><i /><span className="formula-node" /><i /><span className="formula-node" /><i /><span className="formula-node" /></div>
        <div className="calculator-footer"><span>Рецепт появится после импорта базы предметов</span><button disabled>Рассчитать</button></div>
      </div>
    </ModulePage>
  );
}
