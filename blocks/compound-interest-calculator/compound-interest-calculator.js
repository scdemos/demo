 
import { createTag, loadChartJs, createChart } from '../../scripts/shared.js';

const DEFAULTS = {
  initialInvestment: 10000,
  regularContribution: 500,
  contributionFrequency: 'monthly',
  annualRate: 5,
  compoundingFrequency: 'monthly',
  years: 10,
  adjustForInflation: false,
  inflationRate: 2,
  showYearlyBreakdown: false,
};

const CONTRIB_FREQ_PER_YEAR = {
  monthly: 12, biweekly: 26, weekly: 52, annually: 1,
};
const COMPOUND_PER_YEAR = {
  annually: 1, monthly: 12, daily: 365,
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

function moneyDecimals(value, decimals = 2) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value ?? 0);
}

function buildInput({
  id, label, value, min, max, step, suffix, tooltip,
}) {
  const row = createTag('label', { class: 'compound-interest-calculator-row', for: id });
  const labelEl = createTag('span', { class: 'compound-interest-calculator-label' }, label);
  if (tooltip) {
    const tip = createTag('span', { class: 'compound-interest-calculator-tip', title: tooltip, 'aria-label': 'More information' });
    tip.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
    labelEl.append(tip);
  }
  const wrap = createTag('span', { class: 'compound-interest-calculator-input-wrap' });
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
  if (suffix) wrap.append(createTag('span', { class: 'compound-interest-calculator-suffix' }, suffix));
  row.append(labelEl, wrap);
  return { row, input };
}

function buildSelect(id, label, options, value, tooltip) {
  const row = createTag('label', { class: 'compound-interest-calculator-row', for: id });
  const labelEl = createTag('span', { class: 'compound-interest-calculator-label' }, label);
  if (tooltip) {
    const tip = createTag('span', { class: 'compound-interest-calculator-tip', title: tooltip, 'aria-label': 'More information' });
    tip.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
    labelEl.append(tip);
  }
  const select = createTag('select', { id }, options.map((opt) => createTag(
    'option',
    { value: opt.value, selected: opt.value === value ? 'selected' : undefined },
    opt.label,
  )));
  row.append(labelEl, select);
  return { row, input: select };
}

function buildToggle(id, label, checked) {
  const row = createTag('label', { class: 'compound-interest-calculator-row compound-interest-calculator-toggle', for: id });
  const input = createTag('input', {
    id,
    type: 'checkbox',
    checked: checked ? 'checked' : undefined,
  });
  row.append(createTag('span', { class: 'compound-interest-calculator-label' }, label), input);
  return { row, input };
}

/**
 * Compound interest with periodic contributions. Uses monthly steps.
 * Returns { finalBalance, totalContributions, totalInterest, realFinalBalance?, yearlyBreakdown? }.
 */
function calculate(values) {
  const initial = Math.max(0, toNumber(values.initialInvestment, DEFAULTS.initialInvestment));
  const contribution = Math.max(0, toNumber(values.regularContribution, DEFAULTS.regularContribution));
  const contribFreq = values.contributionFrequency || DEFAULTS.contributionFrequency;
  const annualRate = toNumber(values.annualRate, DEFAULTS.annualRate) / 100;
  const compoundFreq = values.compoundingFrequency || DEFAULTS.compoundingFrequency;
  const years = Math.max(0.5, Math.min(50, toNumber(values.years, DEFAULTS.years)));
  const adjustInflation = Boolean(values.adjustForInflation);
  const inflationRate = toNumber(values.inflationRate, DEFAULTS.inflationRate) / 100;
  const showBreakdown = Boolean(values.showYearlyBreakdown);

  const periodsPerYear = COMPOUND_PER_YEAR[compoundFreq] ?? 12;
  const monthlyRate = periodsPerYear === 1
    ? (1 + annualRate) ** (1 / 12) - 1
    : (1 + annualRate / periodsPerYear) ** (periodsPerYear / 12) - 1;

  const contribsPerYear = CONTRIB_FREQ_PER_YEAR[contribFreq] ?? 12;
  const contributionPerMonth = (contribution * contribsPerYear) / 12;

  let balance = initial;
  let cumulativeContrib = initial;
  const monthsTotal = Math.round(years * 12);
  const yearlySnapshots = showBreakdown ? [] : null;
  const maxChartPoints = 120;
  const chartStep = Math.max(1, Math.floor(monthsTotal / maxChartPoints));
  const chartData = [];

  const contributionsPerYear = 12 * contributionPerMonth;

  for (let m = 0; m < monthsTotal; m += 1) {
    balance = balance * (1 + monthlyRate) + contributionPerMonth;
    cumulativeContrib += contributionPerMonth;
    if (showBreakdown && (m + 1) % 12 === 0) {
      yearlySnapshots.push({
        year: (m + 1) / 12,
        balance,
        totalInvestment: cumulativeContrib,
      });
    }
    if (m % chartStep === 0 || m === monthsTotal - 1) {
      chartData.push({
        month: m + 1,
        valueOfInvestment: cumulativeContrib,
        totalValue: balance,
        interestEarned: balance - cumulativeContrib,
      });
    }
  }

  const totalContributions = cumulativeContrib;
  const totalInterest = balance - totalContributions;
  const realFinalBalance = adjustInflation && inflationRate > 0
    ? balance / (1 + inflationRate) ** years
    : null;

  return {
    finalBalance: balance,
    totalContributions,
    totalInterest,
    realFinalBalance,
    yearlyBreakdown: yearlySnapshots,
    yearlyBreakdownInitial: initial,
    yearlyBreakdownContributionsPerYear: contributionsPerYear,
    chartData,
    monthsTotal,
    years,
  };
}

/**
 * Draw stacked area chart with Chart.js (Value of investment + Total interest earned).
 * Uses shared loadChartJs / createChart from scripts/shared.js.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ month, valueOfInvestment, totalValue }>} chartData
 * @returns {Chart|undefined} Chart instance for cleanup on re-render
 */
function drawChartWithChartJs(canvas, chartData) {
  if (!chartData.length || !canvas) return undefined;
  const labels = chartData.map((d) => d.month);
  const valueOfInvestmentData = chartData.map((d) => d.valueOfInvestment);
  const interestData = chartData.map((d) => d.totalValue - d.valueOfInvestment);
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Value of investment',
          data: valueOfInvestmentData,
          backgroundColor: 'rgba(184, 217, 235, 0.7)',
          borderColor: 'rgb(126, 184, 218)',
          borderWidth: 0,
          fill: true,
          tension: 0.2,
        },
        {
          label: 'Total interest earned',
          data: interestData,
          backgroundColor: 'rgba(57, 96, 119, 0.7)',
          borderColor: 'rgb(90, 138, 158)',
          borderWidth: 0,
          fill: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.3,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              return `${ctx.dataset.label}: ${money(v)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Months' },
          stacked: true,
        },
        y: {
          title: { display: true, text: 'Total value' },
          stacked: true,
          beginAtZero: true,
          ticks: {
            callback(value) {
              return money(value);
            },
          },
        },
      },
    },
  };
  return createChart(canvas, config);
}

/**
 * Build chart container with canvas and schedule delayed load of Chart.js, then draw.
 * Keeps Chart.js off the critical path for CWV/Lighthouse.
 * Stores chart on block for cleanup on next render.
 * @param {Element} block - Block element (used to store chart reference for destroy on re-render)
 * @param {Array<{ month, valueOfInvestment, totalValue }>} chartData
 */
function buildChartContainer(block, chartData) {
  if (!chartData.length) return null;
  const wrap = createTag('div', { class: 'compound-interest-calculator-chart-wrap' });
  const canvas = createTag('canvas', {
    class: 'compound-interest-calculator-chart',
    'aria-label': 'Stacked area chart showing value of investment and interest earned over time',
  });
  wrap.append(canvas);

  loadChartJs()
    .then(() => {
      const chart = drawChartWithChartJs(canvas, chartData);
      if (chart && block) block.compoundInterestChart = chart;
    })
    .catch(() => {
      wrap.append(createTag('p', { class: 'compound-interest-calculator-chart-fallback' }, 'Chart unavailable.'));
    });

  return wrap;
}

function metric(title, value, note) {
  return createTag('div', { class: 'compound-interest-calculator-metric' }, [
    createTag('h3', {}, title),
    createTag('p', { class: 'compound-interest-calculator-metric-value' }, value),
    createTag('p', { class: 'compound-interest-calculator-metric-note' }, note),
  ]);
}

function buildLegend() {
  const legend = createTag('details', { class: 'compound-interest-calculator-legend' });
  legend.append(
    createTag('summary', {}, 'How to read this calculator'),
    createTag('div', { class: 'compound-interest-calculator-legend-content' }, [
      createTag('ul', {}, [
        createTag('li', {}, 'Final balance = initial investment plus contributions, compounded at the chosen rate and frequency.'),
        createTag('li', {}, 'Total interest = final balance minus (initial investment + all regular contributions).'),
        createTag('li', {}, 'Compounding frequency affects growth: more frequent compounding yields slightly higher results.'),
        createTag('li', {}, 'Inflation-adjusted (real) value shows purchasing power in today\'s dollars.'),
      ]),
      createTag('p', { class: 'compound-interest-calculator-disclaimer' }, 'Estimates only. Not financial advice.'),
    ]),
  );
  return legend;
}

/**
 * Decorates the compound-interest-calculator block.
 * @param {Element} block
 */
export default function decorate(block) {
  block.textContent = '';
  block.classList.add('compound-interest-calculator');

  const legend = buildLegend();
  const layout = createTag('div', { class: 'compound-interest-calculator-layout' });
  const form = createTag('form', { class: 'compound-interest-calculator-form' });
  const group = createTag('div', { class: 'compound-interest-calculator-group' });
  form.append(group);

  const output = createTag('section', {
    class: 'compound-interest-calculator-output',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  layout.append(form, output);
  block.append(legend, layout);

  const refs = {};
  const add = (cfg) => {
    const { row, input } = buildInput(cfg);
    group.append(row);
    refs[cfg.id] = input;
  };

  const addToggle = (id, label, checked) => {
    const { row, input } = buildToggle(id, label, checked);
    group.append(row);
    refs[id] = input;
  };

  add({
    id: 'cic-initial',
    label: 'Initial investment',
    value: DEFAULTS.initialInvestment,
    min: 0,
    step: 500,
    suffix: 'CAD',
    tooltip: 'Amount you start with today.',
  });
  add({
    id: 'cic-contribution',
    label: 'Regular contribution amount',
    value: DEFAULTS.regularContribution,
    min: 0,
    step: 50,
    suffix: 'CAD',
    tooltip: 'Amount you add at the selected frequency.',
  });
  const contribSelect = buildSelect(
    'cic-contrib-freq',
    'Contribution frequency',
    [
      { value: 'monthly', label: 'Monthly' },
      { value: 'biweekly', label: 'Biweekly' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'annually', label: 'Annually' },
    ],
    DEFAULTS.contributionFrequency,
    'How often you add the contribution amount.',
  );
  group.append(contribSelect.row);
  refs['cic-contrib-freq'] = contribSelect.input;

  add({
    id: 'cic-rate',
    label: 'Annual interest rate',
    value: DEFAULTS.annualRate,
    min: 0,
    max: 50,
    step: 0.1,
    suffix: '%',
    tooltip: 'Expected annual rate of return (e.g. 5 for 5%).',
  });
  const compoundSelect = buildSelect(
    'cic-compound-freq',
    'Compounding frequency',
    [
      { value: 'annually', label: 'Annually' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'daily', label: 'Daily' },
    ],
    DEFAULTS.compoundingFrequency,
    'How often interest is applied to the balance.',
  );
  group.append(compoundSelect.row);
  refs['cic-compound-freq'] = compoundSelect.input;

  add({
    id: 'cic-years',
    label: 'Investment length',
    value: DEFAULTS.years,
    min: 0.5,
    max: 50,
    step: 0.5,
    suffix: 'years',
    tooltip: 'Number of years to project.',
  });

  addToggle('cic-inflation', 'Adjust for inflation', DEFAULTS.adjustForInflation);
  add({
    id: 'cic-inflation-rate',
    label: 'Inflation rate',
    value: DEFAULTS.inflationRate,
    min: 0,
    max: 20,
    step: 0.5,
    suffix: '%',
    tooltip: 'Assumed annual inflation for real (today\'s dollar) value.',
  });
  addToggle('cic-breakdown', 'Show yearly breakdown', DEFAULTS.showYearlyBreakdown);

  function values() {
    return {
      initialInvestment: refs['cic-initial'].value,
      regularContribution: refs['cic-contribution'].value,
      contributionFrequency: refs['cic-contrib-freq'].value,
      annualRate: refs['cic-rate'].value,
      compoundingFrequency: refs['cic-compound-freq'].value,
      years: refs['cic-years'].value,
      adjustForInflation: refs['cic-inflation'].checked,
      inflationRate: refs['cic-inflation-rate'].value,
      showYearlyBreakdown: refs['cic-breakdown'].checked,
    };
  }

  function render() {
    refs['cic-inflation-rate'].disabled = !refs['cic-inflation'].checked;

    if (block.compoundInterestChart) {
      block.compoundInterestChart.destroy();
      block.compoundInterestChart = null;
    }

    const result = calculate(values());
    output.textContent = '';

    output.append(
      metric('Final balance', money(result.finalBalance), 'Projected value at end of term.'),
      metric('Total contributions', money(result.totalContributions), 'Initial investment plus all regular contributions.'),
      metric('Total interest earned', money(result.totalInterest), 'Growth from compounding.'),
    );
    if (result.realFinalBalance != null) {
      output.append(metric('Real (inflation-adjusted) final balance', money(result.realFinalBalance), 'Purchasing power in today\'s dollars.'));
    }

    const showBreakdown = result.yearlyBreakdown && result.yearlyBreakdown.length > 0;
    if (showBreakdown) {
      const initialAmount = result.yearlyBreakdownInitial ?? 0;
      const contribPerYear = result.yearlyBreakdownContributionsPerYear ?? 0;
      const breakdownWrap = createTag('div', { class: 'compound-interest-calculator-metric compound-interest-calculator-breakdown' });
      breakdownWrap.append(createTag('h3', {}, 'Yearly breakdown'));
      const table = createTag('table', { class: 'compound-interest-calculator-table' });
      const sortIcon = '<span class="compound-interest-calculator-table-sort" aria-hidden="true">↕</span>';
      const thead = createTag('thead');
      const theadTr = createTag('tr');
      ['Year', 'Yearly investment', 'Total investment', 'Yearly interest', 'Total interest', 'Total value'].forEach((label, i) => {
        const th = createTag('th', { class: i === 0 ? 'compound-interest-calculator-table-th-year' : 'compound-interest-calculator-table-th-num' });
        th.innerHTML = label + sortIcon;
        theadTr.append(th);
      });
      thead.append(theadTr);
      const tbody = createTag('tbody');
      let prevBalance = initialAmount;
      result.yearlyBreakdown.forEach(({ year, balance, totalInvestment }, index) => {
        const yearlyInvestment = index === 0 ? initialAmount + contribPerYear : contribPerYear;
        const yearlyInterest = balance - prevBalance - contribPerYear;
        const totalInterest = balance - totalInvestment;
        prevBalance = balance;
        tbody.append(createTag('tr', {}, [
          createTag('td', { class: 'compound-interest-calculator-table-td-year' }, String(Math.round(year))),
          createTag('td', { class: 'compound-interest-calculator-table-td-num' }, moneyDecimals(yearlyInvestment)),
          createTag('td', { class: 'compound-interest-calculator-table-td-num' }, moneyDecimals(totalInvestment)),
          createTag('td', { class: 'compound-interest-calculator-table-td-num' }, moneyDecimals(yearlyInterest)),
          createTag('td', { class: 'compound-interest-calculator-table-td-num' }, moneyDecimals(totalInterest)),
          createTag('td', { class: 'compound-interest-calculator-table-td-num' }, moneyDecimals(balance)),
        ]));
      });
      table.append(thead, tbody);
      breakdownWrap.append(table);
      output.append(breakdownWrap);
    } else if (result.chartData && result.chartData.length > 0 && result.finalBalance > 0) {
      const chartCard = createTag('div', { class: 'compound-interest-calculator-metric compound-interest-calculator-chart-card' });
      chartCard.append(createTag('h3', {}, 'Growth over time'));
      const chartEl = buildChartContainer(block, result.chartData);
      if (chartEl) chartCard.append(chartEl);
      output.append(chartCard);
    }
  }

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
}
