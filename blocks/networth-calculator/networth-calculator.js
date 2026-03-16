 
import { createTag } from '../../scripts/shared.js';

const DEFAULTS = {
  afterTaxMonthlyIncome: 6500,
  monthlyEssentialExpenses: 3500,
  monthlyDebtPayments: 600,
  targetEmergencyMonths: 6,
  includeHomeInNetWorth: true,
  cash: 15000,
  tfsa: 30000,
  rrsp: 45000,
  fhsa: 8000,
  nonRegistered: 12000,
  homeValue: 550000,
  pensionValue: 0,
  businessValue: 0,
  vehicleValue: 15000,
  otherAssets: 0,
  mortgage: 380000,
  creditCard: 2000,
  lineOfCredit: 4000,
  studentLoan: 12000,
  carLoan: 8000,
  taxOwing: 0,
  otherLiabilities: 0,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function percent(value, digits = 1) {
  return `${(value || 0).toFixed(digits)}%`;
}

function buildInput({
  id, label, value, step = 1000, suffix = 'CAD', tooltip, min = 0,
}) {
  const row = createTag('label', { class: 'networth-calculator-row', for: id });
  const labelEl = createTag('span', { class: 'networth-calculator-label' }, label);
  if (tooltip) {
    labelEl.append(createTag('span', { class: 'networth-calculator-tip', title: tooltip }, ' ?'));
  }
  const wrap = createTag('span', { class: 'networth-calculator-input-wrap' });
  const input = createTag('input', {
    id,
    type: 'number',
    inputmode: 'decimal',
    min,
    step,
    value: String(value),
  });
  wrap.append(input);
  if (suffix) wrap.append(createTag('span', { class: 'networth-calculator-suffix' }, suffix));
  row.append(labelEl, wrap);
  return { row, input };
}

function buildRange({
  id, label, min, max, step, value, tooltip,
}) {
  const row = createTag('div', { class: 'networth-calculator-row' });
  const labelEl = createTag('span', { class: 'networth-calculator-label' }, label);
  if (tooltip) {
    labelEl.append(createTag('span', { class: 'networth-calculator-tip', title: tooltip }, ' ?'));
  }
  const wrap = createTag('span', { class: 'networth-calculator-input-wrap' });
  const input = createTag('input', {
    id,
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  });
  const valueEl = createTag('span', { class: 'networth-calculator-suffix' }, `${value} mo`);
  wrap.append(input, valueEl);
  row.append(labelEl, wrap);
  return { row, input, valueEl };
}

function buildToggle(id, label, checked = false) {
  const row = createTag('label', { class: 'networth-calculator-row networth-calculator-toggle', for: id });
  const input = createTag('input', {
    id,
    type: 'checkbox',
    checked: checked ? 'checked' : undefined,
  });
  row.append(createTag('span', { class: 'networth-calculator-label' }, label), input);
  return { row, input };
}

function metric(title, value, note) {
  return createTag('div', { class: 'networth-calculator-metric' }, [
    createTag('h3', {}, title),
    createTag('p', { class: 'networth-calculator-metric-value' }, value),
    createTag('p', { class: 'networth-calculator-metric-note' }, note),
  ]);
}

function buildLegend() {
  const legend = createTag('details', { class: 'networth-calculator-legend' });
  legend.append(
    createTag('summary', {}, 'How to read this calculator'),
    createTag('ul', {}, [
      createTag('li', {}, 'Net worth = total assets - total liabilities.'),
      createTag('li', {}, 'Runway = liquid assets divided by monthly essentials.'),
      createTag('li', {}, 'Debt service ratio = debt payments divided by after-tax monthly income.'),
      createTag('li', {}, 'Use this as a planning snapshot, not financial advice.'),
    ]),
  );
  return legend;
}

function evaluateHealth({
  netWorth, runwayMonths, targetEmergencyMonths, debtServiceRatio, debtToAssetRatio,
}) {
  if (netWorth < 0) return 'Rebuild phase';
  if (runwayMonths < 3 || debtServiceRatio > 40) return 'Stabilize cash flow';
  if (runwayMonths < targetEmergencyMonths || debtToAssetRatio > 50) return 'Strengthen foundation';
  return 'Healthy footing';
}

function calculate(values) {
  const assetsCore = {
    cash: Math.max(0, toNumber(values.cash, DEFAULTS.cash)),
    tfsa: Math.max(0, toNumber(values.tfsa, DEFAULTS.tfsa)),
    rrsp: Math.max(0, toNumber(values.rrsp, DEFAULTS.rrsp)),
    fhsa: Math.max(0, toNumber(values.fhsa, DEFAULTS.fhsa)),
    nonRegistered: Math.max(0, toNumber(values.nonRegistered, DEFAULTS.nonRegistered)),
    pensionValue: Math.max(0, toNumber(values.pensionValue, DEFAULTS.pensionValue)),
    businessValue: Math.max(0, toNumber(values.businessValue, DEFAULTS.businessValue)),
    vehicleValue: Math.max(0, toNumber(values.vehicleValue, DEFAULTS.vehicleValue)),
    otherAssets: Math.max(0, toNumber(values.otherAssets, DEFAULTS.otherAssets)),
  };
  const homeValue = Math.max(0, toNumber(values.homeValue, DEFAULTS.homeValue));
  const includeHome = Boolean(values.includeHomeInNetWorth);

  const liabilities = {
    mortgage: Math.max(0, toNumber(values.mortgage, DEFAULTS.mortgage)),
    creditCard: Math.max(0, toNumber(values.creditCard, DEFAULTS.creditCard)),
    lineOfCredit: Math.max(0, toNumber(values.lineOfCredit, DEFAULTS.lineOfCredit)),
    studentLoan: Math.max(0, toNumber(values.studentLoan, DEFAULTS.studentLoan)),
    carLoan: Math.max(0, toNumber(values.carLoan, DEFAULTS.carLoan)),
    taxOwing: Math.max(0, toNumber(values.taxOwing, DEFAULTS.taxOwing)),
    otherLiabilities: Math.max(0, toNumber(values.otherLiabilities, DEFAULTS.otherLiabilities)),
  };

  const totalAssetsExHome = Object.values(assetsCore).reduce((sum, value) => sum + value, 0);
  const totalAssets = totalAssetsExHome + (includeHome ? homeValue : 0);
  const totalLiabilities = Object.values(liabilities).reduce((sum, value) => sum + value, 0);
  const netWorth = totalAssets - totalLiabilities;
  const homeEquity = homeValue - liabilities.mortgage;

  const liquidAssets = assetsCore.cash + assetsCore.tfsa + assetsCore.fhsa + assetsCore.nonRegistered;
  const nonMortgageDebt = totalLiabilities - liabilities.mortgage;
  const liquidNetWorth = liquidAssets - nonMortgageDebt;

  const monthlyEssentialExpenses = Math.max(0, toNumber(values.monthlyEssentialExpenses, DEFAULTS.monthlyEssentialExpenses));
  const monthlyDebtPayments = Math.max(0, toNumber(values.monthlyDebtPayments, DEFAULTS.monthlyDebtPayments));
  const afterTaxMonthlyIncome = Math.max(0, toNumber(values.afterTaxMonthlyIncome, DEFAULTS.afterTaxMonthlyIncome));
  const targetEmergencyMonths = Math.max(1, Math.round(toNumber(values.targetEmergencyMonths, DEFAULTS.targetEmergencyMonths)));

  const runwayMonths = monthlyEssentialExpenses > 0
    ? liquidAssets / monthlyEssentialExpenses : 0;
  const debtToAssetRatio = totalAssets > 0
    ? (totalLiabilities / totalAssets) * 100 : 0;
  const debtServiceRatio = afterTaxMonthlyIncome > 0
    ? (monthlyDebtPayments / afterTaxMonthlyIncome) * 100 : 0;
  const monthlyBuffer = afterTaxMonthlyIncome - monthlyEssentialExpenses - monthlyDebtPayments;

  const registeredAssets = assetsCore.tfsa + assetsCore.rrsp + assetsCore.fhsa
    + assetsCore.pensionValue;
  const investableAssets = registeredAssets + assetsCore.nonRegistered + assetsCore.cash;
  const registeredShare = investableAssets > 0
    ? (registeredAssets / investableAssets) * 100 : 0;
  const housingConcentration = totalAssets > 0 ? (homeValue / totalAssets) * 100 : 0;

  const health = evaluateHealth({
    netWorth,
    runwayMonths,
    targetEmergencyMonths,
    debtServiceRatio,
    debtToAssetRatio,
  });

  const actions = [];
  if (liabilities.creditCard > 0) {
    actions.push('Prioritize credit card balance first (highest interest).');
  }
  if (runwayMonths < targetEmergencyMonths) {
    actions.push(`Build emergency runway toward ${targetEmergencyMonths} months of essentials.`);
  }
  if (debtServiceRatio > 35) {
    actions.push('Reduce monthly debt burden before increasing investment risk.');
  }
  if (registeredShare < 50) {
    actions.push('Review TFSA/RRSP/FHSA room before adding more taxable investments.');
  }
  if (!actions.length) {
    actions.push('Strong base: keep automating savings and review once per quarter.');
  }

  return {
    includeHome,
    totalAssets,
    totalLiabilities,
    netWorth,
    homeEquity,
    liquidAssets,
    liquidNetWorth,
    runwayMonths,
    debtToAssetRatio,
    debtServiceRatio,
    monthlyBuffer,
    registeredShare,
    housingConcentration,
    health,
    actions,
  };
}

/**
 * Decorates the networth-calculator block.
 * @param {Element} block
 */
export default function decorate(block) {
  block.textContent = '';
  block.classList.add('networth-calculator');

  const legend = buildLegend();
  const layout = createTag('div', { class: 'networth-calculator-layout' });
  const form = createTag('form', { class: 'networth-calculator-form' });
  const essentials = createTag('div', { class: 'networth-calculator-group' });
  const optional = createTag('details', { class: 'networth-calculator-optional' });
  optional.append(createTag('summary', {}, 'Optional details'));
  const optionalGroup = createTag('div', { class: 'networth-calculator-group' });
  optional.append(optionalGroup);
  form.append(essentials, optional);

  const output = createTag('section', { class: 'networth-calculator-output', 'aria-live': 'polite' });
  layout.append(form, output);
  block.append(legend, layout);

  const refs = {};
  const add = (cfg, target = essentials) => {
    const { row, input } = buildInput(cfg);
    target.append(row);
    refs[cfg.id] = input;
  };

  add({
    id: 'nwc-after-tax-monthly-income',
    label: 'After-tax monthly income',
    value: DEFAULTS.afterTaxMonthlyIncome,
    step: 100,
    tooltip: 'Used for cash flow and debt service ratio.',
  });
  add({
    id: 'nwc-monthly-essential-expenses',
    label: 'Monthly essential expenses',
    value: DEFAULTS.monthlyEssentialExpenses,
    step: 50,
    tooltip: 'Housing, food, utilities, insurance, transport.',
  });
  add({
    id: 'nwc-monthly-debt-payments',
    label: 'Monthly debt payments',
    value: DEFAULTS.monthlyDebtPayments,
    step: 50,
  });
  const emergencyRange = buildRange({
    id: 'nwc-target-emergency-months',
    label: 'Emergency runway target',
    min: 3,
    max: 12,
    step: 1,
    value: DEFAULTS.targetEmergencyMonths,
  });
  essentials.append(emergencyRange.row);
  refs['nwc-target-emergency-months'] = emergencyRange.input;

  const includeHome = buildToggle(
    'nwc-include-home',
    'Include primary home in net worth',
    DEFAULTS.includeHomeInNetWorth,
  );
  essentials.append(includeHome.row);
  refs['nwc-include-home'] = includeHome.input;

  essentials.append(createTag('h3', { class: 'networth-calculator-subtitle' }, 'Assets'));
  add({
    id: 'nwc-cash', label: 'Cash', value: DEFAULTS.cash, step: 500,
  });
  add({
    id: 'nwc-tfsa', label: 'TFSA', value: DEFAULTS.tfsa, step: 1000,
  });
  add({
    id: 'nwc-rrsp', label: 'RRSP', value: DEFAULTS.rrsp, step: 1000,
  });
  add({
    id: 'nwc-fhsa', label: 'FHSA', value: DEFAULTS.fhsa, step: 500,
  });
  add({
    id: 'nwc-non-registered', label: 'Non-registered investments', value: DEFAULTS.nonRegistered, step: 1000,
  });
  add({
    id: 'nwc-home-value', label: 'Primary home value', value: DEFAULTS.homeValue, step: 5000,
  });

  essentials.append(createTag('h3', { class: 'networth-calculator-subtitle' }, 'Liabilities'));
  add({
    id: 'nwc-mortgage', label: 'Mortgage balance', value: DEFAULTS.mortgage, step: 5000,
  });
  add({
    id: 'nwc-credit-card', label: 'Credit card balance', value: DEFAULTS.creditCard, step: 100,
  });
  add({
    id: 'nwc-line-of-credit', label: 'Line of credit', value: DEFAULTS.lineOfCredit, step: 100,
  });
  add({
    id: 'nwc-student-loan', label: 'Student loan', value: DEFAULTS.studentLoan, step: 500,
  });
  add({
    id: 'nwc-car-loan', label: 'Car loan', value: DEFAULTS.carLoan, step: 500,
  });

  optionalGroup.append(createTag('h3', { class: 'networth-calculator-subtitle' }, 'Additional assets'));
  add({
    id: 'nwc-pension-value', label: 'Pension estimate', value: DEFAULTS.pensionValue, step: 1000,
  }, optionalGroup);
  add({
    id: 'nwc-business-value', label: 'Business value', value: DEFAULTS.businessValue, step: 1000,
  }, optionalGroup);
  add({
    id: 'nwc-vehicle-value', label: 'Vehicle value', value: DEFAULTS.vehicleValue, step: 500,
  }, optionalGroup);
  add({
    id: 'nwc-other-assets', label: 'Other assets', value: DEFAULTS.otherAssets, step: 500,
  }, optionalGroup);

  optionalGroup.append(createTag('h3', { class: 'networth-calculator-subtitle' }, 'Additional liabilities'));
  add({
    id: 'nwc-tax-owing', label: 'Tax owing', value: DEFAULTS.taxOwing, step: 100,
  }, optionalGroup);
  add({
    id: 'nwc-other-liabilities', label: 'Other liabilities', value: DEFAULTS.otherLiabilities, step: 100,
  }, optionalGroup);

  function values() {
    return {
      afterTaxMonthlyIncome: refs['nwc-after-tax-monthly-income'].value,
      monthlyEssentialExpenses: refs['nwc-monthly-essential-expenses'].value,
      monthlyDebtPayments: refs['nwc-monthly-debt-payments'].value,
      targetEmergencyMonths: refs['nwc-target-emergency-months'].value,
      includeHomeInNetWorth: refs['nwc-include-home'].checked,
      cash: refs['nwc-cash'].value,
      tfsa: refs['nwc-tfsa'].value,
      rrsp: refs['nwc-rrsp'].value,
      fhsa: refs['nwc-fhsa'].value,
      nonRegistered: refs['nwc-non-registered'].value,
      homeValue: refs['nwc-home-value'].value,
      mortgage: refs['nwc-mortgage'].value,
      creditCard: refs['nwc-credit-card'].value,
      lineOfCredit: refs['nwc-line-of-credit'].value,
      studentLoan: refs['nwc-student-loan'].value,
      carLoan: refs['nwc-car-loan'].value,
      pensionValue: refs['nwc-pension-value'].value,
      businessValue: refs['nwc-business-value'].value,
      vehicleValue: refs['nwc-vehicle-value'].value,
      otherAssets: refs['nwc-other-assets'].value,
      taxOwing: refs['nwc-tax-owing'].value,
      otherLiabilities: refs['nwc-other-liabilities'].value,
    };
  }

  function render() {
    emergencyRange.valueEl.textContent = `${Math.round(toNumber(emergencyRange.input.value, DEFAULTS.targetEmergencyMonths))} mo`;
    const result = calculate(values());
    output.textContent = '';
    output.append(
      metric('Net worth', money(result.netWorth), `${money(result.totalAssets)} assets - ${money(result.totalLiabilities)} liabilities.`),
      metric('Financial health', result.health, 'Planner-style snapshot based on runway and debt pressure.'),
      metric('Liquid net worth', money(result.liquidNetWorth), `${money(result.liquidAssets)} liquid assets - non-mortgage debt.`),
      metric('Emergency runway', `${result.runwayMonths.toFixed(1)} months`, 'Liquid assets divided by monthly essential expenses.'),
      metric('Debt-to-asset ratio', percent(result.debtToAssetRatio), 'Lower usually means more flexibility and resilience.'),
      metric('Debt service ratio', percent(result.debtServiceRatio), 'Monthly debt payments as % of after-tax monthly income.'),
      metric('Monthly cash buffer', money(result.monthlyBuffer), 'After-tax income minus essentials and debt payments.'),
      metric('Home equity', money(result.homeEquity), result.includeHome ? 'Home value minus mortgage balance.' : 'Reference only; home excluded from net worth total.'),
      metric('Registered share', percent(result.registeredShare), 'Share of investable assets in TFSA/RRSP/FHSA/pension accounts.'),
      metric('Housing concentration', percent(result.housingConcentration), 'Portion of total assets tied to primary residence.'),
    );

    const actionList = createTag('ul', { class: 'networth-calculator-actions' });
    result.actions.forEach((item) => actionList.append(createTag('li', {}, item)));
    output.append(
      createTag('div', { class: 'networth-calculator-metric networth-calculator-actions-card' }, [
        createTag('h3', {}, 'Suggested next steps'),
        actionList,
      ]),
    );
  }

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
}
