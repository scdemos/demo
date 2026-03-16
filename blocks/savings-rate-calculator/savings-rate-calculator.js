 
import { createTag } from '../../scripts/shared.js';

const DEFAULTS = {
  grossIncome: 90000,
  afterTaxIncome: 65000,
  monthlyExpenses: 3200,
  monthlySavings: 1200,
  employerContributions: 0,
  province: 'Ontario',
  currentAssets: 50000,
};

const PRESETS = {
  conservative: 0.12,
  balanced: 0.2,
  aggressive: 0.35,
};

const FEDERAL_TAX = {
  brackets: [
    { upTo: 55867, rate: 0.15 },
    { upTo: 111733, rate: 0.205 },
    { upTo: 173205, rate: 0.26 },
    { upTo: 246752, rate: 0.29 },
    { upTo: Infinity, rate: 0.33 },
  ],
  bpa: 15705,
};

const PROVINCIAL_TAX = {
  Ontario: {
    brackets: [
      { upTo: 51446, rate: 0.0505 },
      { upTo: 102894, rate: 0.0915 },
      { upTo: 150000, rate: 0.1116 },
      { upTo: 220000, rate: 0.1216 },
      { upTo: Infinity, rate: 0.1316 },
    ],
    bpa: 12399,
  },
  Alberta: {
    brackets: [
      { upTo: 148269, rate: 0.1 },
      { upTo: 177922, rate: 0.12 },
      { upTo: 237230, rate: 0.13 },
      { upTo: 355845, rate: 0.14 },
      { upTo: Infinity, rate: 0.15 },
    ],
    bpa: 21885,
  },
  'British Columbia': {
    brackets: [
      { upTo: 47937, rate: 0.0506 },
      { upTo: 95875, rate: 0.077 },
      { upTo: 110076, rate: 0.105 },
      { upTo: 133664, rate: 0.1229 },
      { upTo: 181232, rate: 0.147 },
      { upTo: 252752, rate: 0.168 },
      { upTo: Infinity, rate: 0.205 },
    ],
    bpa: 12580,
  },
  Manitoba: {
    brackets: [
      { upTo: 47000, rate: 0.108 },
      { upTo: 100000, rate: 0.1275 },
      { upTo: Infinity, rate: 0.174 },
    ],
    bpa: 15000,
  },
  'New Brunswick': {
    brackets: [
      { upTo: 49958, rate: 0.094 },
      { upTo: 99916, rate: 0.14 },
      { upTo: 185064, rate: 0.16 },
      { upTo: Infinity, rate: 0.195 },
    ],
    bpa: 13144,
  },
  'Newfoundland and Labrador': {
    brackets: [
      { upTo: 43198, rate: 0.087 },
      { upTo: 86395, rate: 0.145 },
      { upTo: 154244, rate: 0.158 },
      { upTo: 215943, rate: 0.173 },
      { upTo: 275870, rate: 0.183 },
      { upTo: 551739, rate: 0.193 },
      { upTo: 1103478, rate: 0.208 },
      { upTo: Infinity, rate: 0.213 },
    ],
    bpa: 10991,
  },
  'Nova Scotia': {
    brackets: [
      { upTo: 29590, rate: 0.0879 },
      { upTo: 59180, rate: 0.1495 },
      { upTo: 93000, rate: 0.1667 },
      { upTo: 150000, rate: 0.175 },
      { upTo: Infinity, rate: 0.21 },
    ],
    bpa: 8481,
  },
  'Prince Edward Island': {
    brackets: [
      { upTo: 32656, rate: 0.0965 },
      { upTo: 64313, rate: 0.1363 },
      { upTo: 105000, rate: 0.1665 },
      { upTo: 140000, rate: 0.18 },
      { upTo: Infinity, rate: 0.1875 },
    ],
    bpa: 14000,
  },
  Quebec: {
    brackets: [
      { upTo: 51780, rate: 0.14 },
      { upTo: 103545, rate: 0.19 },
      { upTo: 126000, rate: 0.24 },
      { upTo: Infinity, rate: 0.2575 },
    ],
    bpa: 18056,
  },
  Saskatchewan: {
    brackets: [
      { upTo: 52057, rate: 0.105 },
      { upTo: 148734, rate: 0.125 },
      { upTo: Infinity, rate: 0.145 },
    ],
    bpa: 18000,
  },
  'Northwest Territories': {
    brackets: [
      { upTo: 50597, rate: 0.059 },
      { upTo: 101198, rate: 0.086 },
      { upTo: 164525, rate: 0.122 },
      { upTo: Infinity, rate: 0.1405 },
    ],
    bpa: 17373,
  },
  Nunavut: {
    brackets: [
      { upTo: 53268, rate: 0.04 },
      { upTo: 106537, rate: 0.07 },
      { upTo: 173205, rate: 0.09 },
      { upTo: Infinity, rate: 0.115 },
    ],
    bpa: 17925,
  },
  Yukon: {
    brackets: [
      { upTo: 55867, rate: 0.064 },
      { upTo: 111733, rate: 0.09 },
      { upTo: 173205, rate: 0.109 },
      { upTo: 500000, rate: 0.128 },
      { upTo: Infinity, rate: 0.15 },
    ],
    bpa: 15705,
  },
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
  id, label, value, min, max, step, suffix, tooltip,
}) {
  const row = createTag('label', { class: 'savings-rate-calculator-row', for: id });
  const labelEl = createTag('span', { class: 'savings-rate-calculator-label' }, label);
  if (tooltip) {
    labelEl.append(createTag('span', { class: 'savings-rate-calculator-tip', title: tooltip }, ' ?'));
  }
  const wrap = createTag('span', { class: 'savings-rate-calculator-input-wrap' });
  const input = createTag('input', {
    id,
    type: 'number',
    inputmode: 'decimal',
    min,
    max,
    step,
    value: String(value),
  });
  wrap.append(input);
  if (suffix) wrap.append(createTag('span', { class: 'savings-rate-calculator-suffix' }, suffix));
  row.append(labelEl, wrap);
  return { row, input };
}

function buildToggle(id, label, checked) {
  const row = createTag('label', { class: 'savings-rate-calculator-row savings-rate-calculator-toggle', for: id });
  const input = createTag('input', {
    id,
    type: 'checkbox',
    checked: checked ? 'checked' : undefined,
  });
  row.append(createTag('span', { class: 'savings-rate-calculator-label' }, label), input);
  return { row, input };
}

function estimateCppEiAnnual(grossAnnual) {
  const cpp = Math.min(grossAnnual * 0.0595, 3867);
  const ei = Math.min(grossAnnual * 0.0166, 1049);
  return cpp + ei;
}

function progressiveTax(income, brackets) {
  let tax = 0;
  let previous = 0;
  for (let i = 0; i < brackets.length; i += 1) {
    const { upTo, rate } = brackets[i];
    const taxable = Math.max(0, Math.min(income, upTo) - previous);
    tax += taxable * rate;
    previous = upTo;
    if (income <= upTo) break;
  }
  return tax;
}

function benchmark(rate) {
  if (rate < 10) return { label: 'Below target', note: 'Try increasing savings toward at least 15-20% of after-tax income.' };
  if (rate < 20) return { label: 'Getting started', note: 'You are building momentum. Reaching 20% is a strong next milestone.' };
  if (rate < 30) return { label: 'On track', note: 'You are saving at a healthy pace for long-term progress.' };
  return { label: 'Very strong', note: 'Excellent saving pace. Stay consistent and review goals yearly.' };
}

function calculate(values) {
  const grossIncome = Math.max(0, toNumber(values.grossIncome, DEFAULTS.grossIncome));
  const manualAfterTax = values.overrideAfterTax;
  const province = values.province || DEFAULTS.province;

  const cppEiAnnual = estimateCppEiAnnual(grossIncome);
  const provinceTaxConfig = PROVINCIAL_TAX[province] || PROVINCIAL_TAX[DEFAULTS.province];
  const federalTaxRaw = progressiveTax(grossIncome, FEDERAL_TAX.brackets);
  const provincialTaxRaw = progressiveTax(grossIncome, provinceTaxConfig.brackets);

  const federalCredit = FEDERAL_TAX.bpa * FEDERAL_TAX.brackets[0].rate;
  const provincialCredit = provinceTaxConfig.bpa * provinceTaxConfig.brackets[0].rate;
  const estimatedIncomeTax = Math.max(
    0,
    (federalTaxRaw - federalCredit) + (provincialTaxRaw - provincialCredit),
  );
  const estimatedEffectiveRate = grossIncome > 0 ? ((estimatedIncomeTax / grossIncome) * 100) : 0;
  const autoAfterTax = Math.max(0, grossIncome - estimatedIncomeTax - cppEiAnnual);
  const afterTaxIncome = manualAfterTax
    ? Math.max(0, toNumber(values.afterTaxIncome, DEFAULTS.afterTaxIncome))
    : autoAfterTax;

  const monthlyExpenses = Math.max(0, toNumber(values.monthlyExpenses, DEFAULTS.monthlyExpenses));
  const monthlySavings = Math.max(0, toNumber(values.monthlySavings, DEFAULTS.monthlySavings));
  const employerContributions = Math.max(0, toNumber(values.employerContributions, DEFAULTS.employerContributions));

  const totalSavingsMonthly = monthlySavings + employerContributions;
  const totalSavingsAnnual = totalSavingsMonthly * 12;
  const savingsRate = afterTaxIncome > 0 ? ((totalSavingsAnnual / afterTaxIncome) * 100) : 0;

  const currentAssets = Math.max(0, toNumber(values.currentAssets, DEFAULTS.currentAssets));
  const monthlyAfterTax = afterTaxIncome / 12;
  const monthlyGap = monthlyAfterTax - monthlyExpenses;
  const targetRate = 20;
  const targetMonthlySavings = (afterTaxIncome * (targetRate / 100)) / 12;
  const extraNeededForTarget = Math.max(0, targetMonthlySavings - totalSavingsMonthly);
  const assetsCoverageYears = monthlyExpenses > 0
    ? (currentAssets / (monthlyExpenses * 12)) : 0;
  const status = benchmark(savingsRate);

  return {
    afterTaxIncome,
    savingsRate,
    totalSavingsMonthly,
    totalSavingsAnnual,
    monthlyGap,
    targetRate,
    extraNeededForTarget,
    assetsCoverageYears,
    status,
    estimatedEffectiveRate,
  };
}

function metric(title, value, note) {
  return createTag('div', { class: 'savings-rate-calculator-metric' }, [
    createTag('h3', {}, title),
    createTag('p', { class: 'savings-rate-calculator-metric-value' }, value),
    createTag('p', { class: 'savings-rate-calculator-metric-note' }, note),
  ]);
}

function buildLegend() {
  const legend = createTag('details', { class: 'savings-rate-calculator-legend' });
  legend.append(
    createTag('summary', {}, 'How to read this calculator'),
    createTag('ul', {}, [
      createTag('li', {}, 'Savings rate: annual savings divided by after-tax income.'),
      createTag('li', {}, 'Tax estimate: federal + provincial bracket estimate only.'),
      createTag('li', {}, 'Monthly surplus: after-tax monthly income minus expenses.'),
      createTag('li', {}, '20% target: common benchmark, not a strict rule.'),
    ]),
  );
  return legend;
}

/**
 * Decorates the savings-rate-calculator block.
 * @param {Element} block
 */
export default function decorate(block) {
  block.textContent = '';
  block.classList.add('savings-rate-calculator');

  const presets = createTag('div', { class: 'savings-rate-calculator-presets' });
  const presetLabel = createTag('p', { class: 'savings-rate-calculator-presets-label' }, 'Presets:');
  const presetButtons = [
    createTag('button', { type: 'button', 'data-preset': 'conservative' }, 'Conservative'),
    createTag('button', { type: 'button', 'data-preset': 'balanced' }, 'Balanced'),
    createTag('button', { type: 'button', 'data-preset': 'aggressive' }, 'Aggressive'),
  ];
  presets.append(presetLabel, ...presetButtons);
  const legend = buildLegend();

  const layout = createTag('div', { class: 'savings-rate-calculator-layout' });
  const form = createTag('form', { class: 'savings-rate-calculator-form' });
  const essentials = createTag('div', { class: 'savings-rate-calculator-group' });
  form.append(essentials);
  const output = createTag('section', { class: 'savings-rate-calculator-output', 'aria-live': 'polite' });
  layout.append(form, output);

  const inputRefs = {};
  const add = (cfg, target = essentials) => {
    const { row, input } = buildInput(cfg);
    target.append(row);
    inputRefs[cfg.id] = input;
  };

  const addToggle = (id, label, checked, target = essentials) => {
    const { row, input } = buildToggle(id, label, checked);
    target.append(row);
    inputRefs[id] = input;
  };

  add({
    id: 'src-gross-income', label: 'Gross annual income', value: DEFAULTS.grossIncome, min: 0, step: 1000, suffix: 'CAD',
  });

  addToggle('src-override-after-tax', 'Override after-tax income estimate', false);
  add({
    id: 'src-after-tax-income', label: 'After-tax income', value: DEFAULTS.afterTaxIncome, min: 0, step: 1000, suffix: 'CAD',
  });

  add({
    id: 'src-monthly-expenses', label: 'Monthly expenses', value: DEFAULTS.monthlyExpenses, min: 0, step: 50, suffix: 'CAD',
  });
  add({
    id: 'src-monthly-savings',
    label: 'Monthly savings/investments',
    value: DEFAULTS.monthlySavings,
    min: 0,
    step: 50,
    suffix: 'CAD',
    tooltip: 'Savings rate = total savings / after-tax income.',
  });
  add({
    id: 'src-employer-contributions', label: 'Others', value: DEFAULTS.employerContributions, min: 0, step: 50, suffix: 'CAD',
  });

  const provinceRow = createTag('label', { class: 'savings-rate-calculator-row', for: 'src-province' });
  const provinceSelect = createTag('select', { id: 'src-province' }, [
    createTag('option', { value: 'Ontario', selected: 'selected' }, 'Ontario'),
    createTag('option', { value: 'Alberta' }, 'Alberta'),
    createTag('option', { value: 'British Columbia' }, 'British Columbia'),
    createTag('option', { value: 'Manitoba' }, 'Manitoba'),
    createTag('option', { value: 'New Brunswick' }, 'New Brunswick'),
    createTag('option', { value: 'Newfoundland and Labrador' }, 'Newfoundland and Labrador'),
    createTag('option', { value: 'Nova Scotia' }, 'Nova Scotia'),
    createTag('option', { value: 'Prince Edward Island' }, 'Prince Edward Island'),
    createTag('option', { value: 'Quebec' }, 'Quebec'),
    createTag('option', { value: 'Saskatchewan' }, 'Saskatchewan'),
    createTag('option', { value: 'Northwest Territories' }, 'Northwest Territories'),
    createTag('option', { value: 'Nunavut' }, 'Nunavut'),
    createTag('option', { value: 'Yukon' }, 'Yukon'),
  ]);
  const provinceLabel = createTag('span', { class: 'savings-rate-calculator-label' }, 'Province');
  provinceLabel.append(
    createTag('span', {
      class: 'savings-rate-calculator-tip',
      title: 'Auto after-tax estimate uses federal + provincial progressive tax brackets and basic credits. Estimates only.',
    }, ' ?'),
  );
  provinceRow.append(provinceLabel, provinceSelect);
  essentials.append(provinceRow);
  inputRefs['src-province'] = provinceSelect;
  add({
    id: 'src-current-assets', label: 'Current investable assets', value: DEFAULTS.currentAssets, min: 0, step: 1000, suffix: 'CAD',
  });

  const progressWrap = createTag('div', { class: 'savings-rate-calculator-progress' }, [
    createTag('p', { class: 'savings-rate-calculator-progress-label' }, 'Savings rate progress'),
    createTag('div', { class: 'savings-rate-calculator-progress-track' }, [
      createTag('span', { class: 'savings-rate-calculator-progress-fill' }),
    ]),
  ]);
  block.append(presets, legend, progressWrap, layout);

  function values() {
    return {
      grossIncome: inputRefs['src-gross-income'].value,
      overrideAfterTax: inputRefs['src-override-after-tax'].checked,
      afterTaxIncome: inputRefs['src-after-tax-income'].value,
      monthlyExpenses: inputRefs['src-monthly-expenses'].value,
      monthlySavings: inputRefs['src-monthly-savings'].value,
      employerContributions: inputRefs['src-employer-contributions'].value,
      province: inputRefs['src-province'].value,
      currentAssets: inputRefs['src-current-assets'].value,
    };
  }

  function render() {
    const manualAfterTax = inputRefs['src-override-after-tax'].checked;
    inputRefs['src-after-tax-income'].disabled = !manualAfterTax;

    const result = calculate(values());
    if (!manualAfterTax) {
      inputRefs['src-after-tax-income'].value = String(Math.round(result.afterTaxIncome));
    }
    output.textContent = '';
    output.append(
      metric(
        'Savings rate',
        percent(result.savingsRate),
        'Savings rate = total savings divided by after-tax income.',
      ),
      metric(
        'Estimated effective tax',
        percent(result.estimatedEffectiveRate),
        'Estimated from federal + provincial progressive brackets and basic credits.',
      ),
      metric('Net savings per month', money(result.totalSavingsMonthly), 'Includes your monthly savings and employer contributions.'),
      metric('Net savings per year', money(result.totalSavingsAnnual), 'Annualized from your monthly savings behavior.'),
      metric(
        'Monthly surplus',
        money(result.monthlyGap),
        result.monthlyGap >= 0
          ? 'Positive surplus means your income still covers spending.'
          : 'Negative surplus means expenses are above after-tax monthly income.',
      ),
      metric(
        'Are you saving enough?',
        result.status.label,
        result.status.note,
      ),
      metric(
        `Extra needed for ${result.targetRate}% target`,
        money(result.extraNeededForTarget),
        'How much additional monthly saving would help you reach a 20% savings rate.',
      ),
      metric(
        'Asset coverage',
        `${result.assetsCoverageYears.toFixed(1)} years`,
        'How many years your current assets could cover current spending.',
      ),
    );

    const fill = block.querySelector('.savings-rate-calculator-progress-fill');
    const clamped = Math.max(0, Math.min(70, result.savingsRate));
    fill.style.inlineSize = `${(clamped / 70) * 100}%`;
  }

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-preset');
      const ratio = PRESETS[key];
      if (!ratio) return;
      const state = values();
      const current = calculate(state);
      inputRefs['src-monthly-savings'].value = String(Math.max(0, Math.round((current.afterTaxIncome * ratio) / 12)));
      presetButtons.forEach((btn) => btn.classList.remove('is-active'));
      button.classList.add('is-active');
      render();
    });
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);

  render();
}
