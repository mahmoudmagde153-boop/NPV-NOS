let currentProject = 'Zomra'; // V2
let typingTimer;

let discountRates = {
    0: 19, 1: 18, 2: 15, 3: 13, 4: 10,
    5: 10, 6: 9, 7: 9, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9
};

let globalCustomFlows = [];
let basePvCache = 0;
let basePriceCache = 0;

// --- Utilities ---
function formatDate(date) {
    if (isNaN(date)) return '';
    let d = new Date(date), month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}
function formatDateExport(dateStr) {
    let d = new Date(dateStr);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear().toString().substr(-2)}`;
}

function addMonths(date, months) {
    let d = new Date(date);
    let originalDay = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() !== originalDay && d.getDate() < 5) {
        d.setDate(0); 
    }
    return d;
}

function formatCurr(num) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EGP' }).format(num);
}
function formatNum(num) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
}
function formatPct(num) {
    return (num * 100).toFixed(2) + '%';
}

function getRateForYear(y) {
    if (y < 0) y = 0;
    if (y > 15) y = 15;
    return discountRates[y] / 100;
}

// --- UI Logic ---
function setProject(proj) {
    currentProject = proj;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderBaseInputs();
    renderCustomInputs();
    calculate();
}

function delayedCalculate() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(calculate, 300);
}

function toggleFixedInst() {
    let chk = document.getElementById('fixed-inst-toggle').checked;
    document.getElementById('fixed-inst-val').disabled = !chk;
    calculate();
}

function resetCustomInputs() {
    document.getElementById('duration-years').value = 8;
    document.getElementById('payment-frequency').value = 4;
    document.getElementById('fixed-inst-toggle').checked = false;
    document.getElementById('fixed-inst-val').disabled = true;
    document.getElementById('fixed-inst-val').value = '';
    
    let instOverride = document.getElementById('custom-inst-count');
    if (instOverride) instOverride.value = '';
    
    document.querySelectorAll('#custom-inputs input[type="number"]').forEach(el => el.value = '');
    document.querySelectorAll('#custom-inputs select').forEach(el => el.value = 'pct');
    
    calculate();
}

function createInputGroup(id, label) {
    return `
    <div class="input-group">
        <label>${label}</label>
        <div style="display:flex; gap:5px;">
            <input type="number" id="${id}-val" oninput="delayedCalculate()" placeholder="Value">
            <select id="${id}-type" onchange="calculate()">
                <option value="pct">%</option>
                <option value="amt">EGP</option>
            </select>
        </div>
    </div>`;
}

function renderBaseInputs() {
    let html = '';
    html += `<div class="input-group">
        <label>Base Years</label>
        <input type="number" id="base-duration-years" value="8" min="1" max="15" oninput="delayedCalculate()">
    </div>`;
    html += `<div class="input-group">
        <label>Base Freq</label>
        <select id="base-payment-frequency" onchange="calculate()">
            <option value="4">Quarterly</option>
            <option value="2">Semi-Annual</option>
        </select>
    </div>`;
    html += `<div class="input-group">
        <label>Installments (Override)</label>
        <input type="number" id="base-inst-count" placeholder="Auto" oninput="delayedCalculate()">
    </div>`;
    
    let createBaseInput = (id, label, val) => `
        <div class="input-group">
            <label>${label}</label>
            <div style="display:flex; gap:5px;">
                <input type="number" id="base-${id}" value="${val}" oninput="delayedCalculate()" placeholder="%">
                <select id="base-${id}-type" disabled style="background:#eee;"><option value="pct">%</option></select>
            </div>
        </div>`;
        
    html += createBaseInput('dp1', 'Base DP 1', currentProject==='Zomra'?2.5:5);
    html += createBaseInput('dp2', 'Base DP 2', currentProject==='Zomra'?2.5:5);
    if(currentProject === 'Zomra') {
        html += createBaseInput('addl', 'Base 6-Months', 5);
        html += createBaseInput('deliv', 'Base Delivery', 5);
    }
    
    document.getElementById('base-inputs').innerHTML = html;
}

function renderCustomInputs() {
    let html = '';
    html += createInputGroup('dp1', 'Down Payment 1');
    html += createInputGroup('dp2', 'Down Payment 2');
    
    if (currentProject === 'Zomra') {
        html += createInputGroup('addl', '6-Months Payment');
        html += createInputGroup('deliv', 'Delivery Payment');
    }
    document.getElementById('custom-inputs').innerHTML = html;
}

// --- Engine ---
function getPeriod(months) {
    return Math.floor(months / 3);
}

function getRateForPeriod(period, isDP) {
    if (isDP) return getRateForYear(0); 
    let year = Math.floor(period / 4) + 1;
    return getRateForYear(year);
}

function generateFlowsTemplate(contractDateStr, years, freqMonths, isBase = false) {
    let flows = [];
    let totalMonths = years * 12;
    
    // Check for overridden installment count
    let overrideEl = document.getElementById(isBase ? 'base-inst-count' : 'custom-inst-count');
    let overrideInstCount = (overrideEl && overrideEl.value) ? parseInt(overrideEl.value) : null;
    
    // Check for overridden percentages (if empty, fallback to defaults)
    let getOverridePct = (id, def) => {
        let el = document.getElementById(isBase ? 'base-'+id : id+'-val');
        if (el && el.value) {
            let typeEl = document.getElementById(isBase ? 'base-'+id+'-type' : id+'-type');
            if (!typeEl || typeEl.value === 'pct') {
                return parseFloat(el.value) / 100;
            }
        }
        return def;
    };
    
    if (currentProject === 'Zomra') {
        flows.push({ id: 'dp1', label: 'Down Payment', date: contractDateStr, months: 0, isDP: true, defaultPct: getOverridePct('dp1', 0.025) });
        
        let dp2Date = formatDate(addMonths(contractDateStr, 1));
        flows.push({ id: 'dp2', label: '2nd Payment', date: dp2Date, months: 1, isDP: true, defaultPct: getOverridePct('dp2', 0.025) });
        
        let addlDate = formatDate(addMonths(contractDateStr, 6));
        flows.push({ id: 'addl', label: '6-Months Payment', date: addlDate, months: 6, isDP: true, defaultPct: getOverridePct('addl', 0.05) });
        
        let delivDate = formatDate(addMonths(contractDateStr, 37));
        flows.push({ id: 'deliv', label: 'Delivery Payment', date: delivDate, months: 37, isDP: true, defaultPct: getOverridePct('deliv', 0.05) });
        
        let mnt1Date = formatDate(addMonths(contractDateStr, 24));
        flows.push({ id: 'mnt1', label: 'Maintenance 1', date: mnt1Date, months: 24, isMnt: true });
        flows.push({ id: 'mnt2', label: 'Maintenance 2', date: delivDate, months: 37, isMnt: true });
        
        let numInst = overrideInstCount !== null && overrideInstCount !== "" ? parseInt(overrideInstCount) : (years * (12 / freqMonths));
        for (let i = 0; i < numInst; i++) {
            let m = 4 + i * freqMonths;
            let dStr = formatDate(addMonths(contractDateStr, m));
            flows.push({ id: `inst_${i}`, label: 'Installment ' + (i+1), date: dStr, months: m, isInst: true });
        }
        
    } else { // Perla
        flows.push({ id: 'dp1', label: 'Down Payment', date: contractDateStr, months: 0, isDP: true, defaultPct: getOverridePct('dp1', 0.05) });
        
        let dp2Date = formatDate(addMonths(contractDateStr, 3));
        flows.push({ id: 'dp2', label: '2nd Payment', date: dp2Date, months: 3, isDP: true, defaultPct: getOverridePct('dp2', 0.05) });
        
        let delivDate = formatDate(addMonths(contractDateStr, 48));
        
        let mnt1Date = formatDate(addMonths(contractDateStr, 36));
        flows.push({ id: 'mnt1', label: 'Maintenance 1', date: mnt1Date, months: 36, isMnt: true });
        flows.push({ id: 'mnt2', label: 'Maintenance 2', date: delivDate, months: 48, isMnt: true });
        
        let numInst = overrideInstCount !== null ? overrideInstCount : null;
        
        let curMonth = 3 + freqMonths; // 6 (Quarterly) or 9 (Semi-annual)
        let instList = [];
        
        if (numInst !== null) {
            for (let i=0; i<numInst; i++) {
                instList.push(curMonth);
                curMonth += freqMonths;
            }
        } else {
            while (curMonth <= totalMonths) { instList.push(curMonth); curMonth += freqMonths; }
            if (freqMonths === 6 && instList.length > 0 && instList[instList.length-1] > totalMonths - 3) instList.pop(); 
        }
        
        instList.forEach((m, i) => {
            let dStr = formatDate(addMonths(contractDateStr, m));
            flows.push({ id: `inst_${i}`, label: 'Installment ' + (i+1), date: dStr, months: m, isInst: true });
        });
    }
    
    let mergedFlows = [];
    flows.forEach(f => {
        let existing = mergedFlows.find(mf => mf.date === f.date && !mf.isMnt && !f.isMnt);
        if (existing) {
            existing.label += ' + ' + f.label;
            existing.isMerged = true;
            existing.mergedIds = existing.mergedIds || [existing.id];
            existing.mergedIds.push(f.id);
            if (f.defaultPct) existing.defaultPct = (existing.defaultPct || 0) + f.defaultPct;
        } else {
            mergedFlows.push(f);
        }
    });
    
    mergedFlows.sort((a,b) => {
        if (a.isMnt && !b.isMnt) return 1;
        if (!a.isMnt && b.isMnt) return -1;
        return a.months - b.months;
    });
    
    return mergedFlows;
}

function applyDiscountLogic(f, contractDateStr) {
    if (!contractDateStr) {
        let el = document.getElementById('contract-date');
        contractDateStr = el ? el.value : null;
    }
    if (!contractDateStr) return;
    
    let pDate = new Date(f.date);
    let cDate = new Date(contractDateStr);
    let months = (pDate.getFullYear() - cDate.getFullYear()) * 12 + pDate.getMonth() - cDate.getMonth();
    if (pDate.getDate() < cDate.getDate() && pDate.getDate() < 28) {
        months--;
    }
    
    let ratesMap = {
        0: 0.18, 1: 0.15, 2: 0.13, 3: 0.10, 4: 0.10, 5: 0.09, 6: 0.09, 7: 0.09, 8: 0.09, 9: 0.09, 10: 0.09
    };
    
    if (currentProject === 'Zomra') {
        let yearIndex = Math.floor(months / 12);
        let rate = ratesMap[yearIndex] !== undefined ? ratesMap[yearIndex] : 0.09;
        
        if (f.id === 'dp1' || f.id === 'dp2' || f.isMnt) {
            f.rate = 0;
            f.period = 0;
            f.pvFactor = 1;
            f.pv = f.amount;
        } else if (f.id === 'addl') {
            f.rate = rate;
            f.period = 2; // PMT 2 in Excel
            f.pvFactor = 1 / Math.pow(1 + rate * 2 / 12, 2);
            f.pv = f.amount * f.pvFactor;
        } else {
            let pmt = Math.round(months / 3);
            f.rate = rate;
            f.period = pmt;
            f.pvFactor = 1 / Math.pow(1 + rate / 4, pmt);
            f.pv = f.amount * f.pvFactor;
        }
    } else if (currentProject === 'Perla') {
        if (f.id === 'dp1' || f.isMnt) {
            f.rate = 0;
            f.period = 0;
            f.pvFactor = 1;
            f.pv = f.amount;
        } else {
            let pmt = Math.round(months / 3);
            f.period = pmt;
            
            if (pmt === 1) {
                f.rate = 0.19; // DP2 in Excel gets 19%
            } else {
                let yearIndex = Math.floor((pmt - 2) / 4);
                f.rate = ratesMap[yearIndex] !== undefined ? ratesMap[yearIndex] : 0.09;
            }
            
            f.pvFactor = 1 / Math.pow(1 + f.rate / 4, f.period);
            f.pv = f.amount * f.pvFactor;
        }
    } else {
        f.period = getPeriod(f.months);
        f.rate = getRateForPeriod(f.period, f.isDP && f.months === 0);
        f.pvFactor = 1 / Math.pow(1 + f.rate / 4, f.period);
        f.pv = f.amount * f.pvFactor;
    }
}

function calculateBaseFlows(price, template) {
    let flows = JSON.parse(JSON.stringify(template));
    
    // The NPV engine operates on 100% of the unit price (ignoring maintenance)
    let remaining = price; 
    let dynamicInsts = [];
    
    flows.forEach(f => {
        if (f.isMnt) {
            f.amount = price * 0.04; // 8% total
        } else if (f.isDP || f.isMerged) {
            f.amount = price * (f.defaultPct || 0);
            remaining -= f.amount;
        }
        if (f.isInst || f.isMerged) dynamicInsts.push(f);
    });
    
    let instAmt = dynamicInsts.length > 0 ? remaining / dynamicInsts.length : 0;
    
    flows.forEach(f => {
        if (f.isInst || f.isMerged) f.amount = (f.amount || 0) + instAmt;
        
        applyDiscountLogic(f);
    });
    
    return flows;
}

function getCustomInputAmt(id, price) {
    let valEl = document.getElementById(id + '-val');
    let typeEl = document.getElementById(id + '-type');
    if (!valEl || !valEl.value) return null;
    let v = parseFloat(valEl.value);
    if (typeEl.value === 'pct') return price * (v / 100);
    return v;
}

function solveForPrice(basePv, template) {
    let low = 0, high = basePriceCache * 10, bestPrice = basePriceCache;
    let isFixedInst = document.getElementById('fixed-inst-toggle').checked;
    let fixedInstVal = parseFloat(document.getElementById('fixed-inst-val').value) || 0;
    
    for (let i = 0; i < 50; i++) {
        let mid = (low + high) / 2;
        let testPv = 0;
        
        let dp1 = getCustomInputAmt('dp1', mid);
        let dp2 = getCustomInputAmt('dp2', mid);
        let addl = getCustomInputAmt('addl', mid);
        let deliv = getCustomInputAmt('deliv', mid);
        
        let flows = JSON.parse(JSON.stringify(template));
        let remAmt = mid; 
        let overrides = window.globalTableOverrides || {};
        
        flows.forEach(f => {
            if (f.isMnt) {
                f.amount = mid * 0.04;
            } else {
                if (overrides[f.id] && overrides[f.id].date) {
                    f.date = overrides[f.id].date;
                    let d1 = new Date(document.getElementById('contract-date').value);
                    let d2 = new Date(f.date);
                    f.months = Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * 30.416));
                }
                
                if (overrides[f.id] && overrides[f.id].amount !== undefined) {
                    let ov = overrides[f.id];
                    f.amount = ov.isPct ? mid * (ov.amount / 100) : ov.amount;
                    f.isFixedOverride = true;
                } else if (f.id === 'dp1') f.amount = dp1 !== null ? dp1 : mid * (f.defaultPct||0);
                else if (f.id === 'dp2') f.amount = dp2 !== null ? dp2 : mid * (f.defaultPct||0);
                else if (f.id === 'addl') f.amount = addl !== null ? addl : mid * (f.defaultPct||0);
                else if (f.id === 'deliv') f.amount = deliv !== null ? deliv : mid * (f.defaultPct||0);
                else if (f.isMerged) {
                    let m_amt = 0;
                    if (f.mergedIds.includes('deliv')) m_amt += deliv !== null ? deliv : mid * 0.05;
                    f.amount = m_amt; 
                }
                
                if (!f.isInst && f.id !== 'deliv' && !f.isMerged) remAmt -= f.amount;
                if (f.id === 'deliv' && !f.isMerged) remAmt -= f.amount;
            }
        });
        
        flows.forEach(f => {
            if (f.isMerged) remAmt -= f.amount; 
        });
        
        let dynamicInsts = flows.filter(f => f.isInst || f.isMerged);
        let instAmt = isFixedInst ? fixedInstVal : (remAmt / dynamicInsts.length);
        
        let is7030 = document.getElementById('toggle-70-30') && document.getElementById('toggle-70-30').checked;
        let freqMonths = parseInt(document.getElementById('payment-frequency').value) === 2 ? 6 : 3;
        let instsPerYear = 12 / freqMonths;
        let accumulatedWithheld = 0;
        let instIndex = 0;
        
        flows.forEach(f => {
            if (f.isInst || f.isMerged) {
                let currentInstAmt = instAmt;
                if (is7030 && !isFixedInst) {
                    let isBumpInst = false;
                    if (currentProject === 'Perla') {
                        isBumpInst = (f.months % 12 === 0 && f.months > 0);
                    } else {
                        isBumpInst = (instIndex % instsPerYear === instsPerYear - 1);
                    }
                    let isLastInst = (instIndex === dynamicInsts.length - 1);
                    
                    if (isBumpInst || isLastInst) {
                        currentInstAmt = instAmt + accumulatedWithheld;
                        accumulatedWithheld = 0;
                    } else {
                        currentInstAmt = instAmt * 0.70;
                        accumulatedWithheld += (instAmt * 0.30);
                    }
                }
                f.amount = (f.amount || 0) + currentInstAmt;
                if (f.isBump) f.amount += f.bumpAmount;
                
                if (overrides[f.id] && overrides[f.id].amount !== undefined) {
                    let ov = overrides[f.id];
                    f.amount = ov.isPct ? mid * (ov.amount / 100) : ov.amount;
                    f.isFixedOverride = true;
                }
                
                instIndex++;
            }
            
            applyDiscountLogic(f);
            
            if (!f.isMnt) testPv += f.pv; // ONLY non-maintenance flows are included in the PV target matching!
        });
        
        if (testPv > basePv) high = mid; else low = mid;
        bestPrice = mid;
    }
    
    return bestPrice;
}

function calculateCustomFlows(price, template) {
    let isFixedInstToggle = document.getElementById('fixed-inst-toggle').checked;
    let fixedInstVal = parseFloat(document.getElementById('fixed-inst-val').value) || 0;
    let isFixedInst = isFixedInstToggle && fixedInstVal > 0;
    
    let dp1 = getCustomInputAmt('dp1', price);
    let dp2 = getCustomInputAmt('dp2', price);
    let addl = getCustomInputAmt('addl', price);
    let deliv = getCustomInputAmt('deliv', price);
    
    let flows = JSON.parse(JSON.stringify(template));
    let remAmt = price; 
    let overrides = window.globalTableOverrides || {};
    
    flows.forEach(f => {
        if (f.isMnt) {
            f.amount = price * 0.04;
        } else {
            if (overrides[f.id] && overrides[f.id].date) {
                f.date = overrides[f.id].date;
                let d1 = new Date(document.getElementById('contract-date').value);
                let d2 = new Date(f.date);
                f.months = Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * 30.416));
            }
            
            if (overrides[f.id] && overrides[f.id].amount !== undefined) {
                let ov = overrides[f.id];
                f.amount = ov.isPct ? price * (ov.amount / 100) : ov.amount;
                f.isFixedOverride = true;
            } else if (f.id === 'dp1') f.amount = dp1 !== null ? dp1 : price * (f.defaultPct||0);
            else if (f.id === 'dp2') f.amount = dp2 !== null ? dp2 : price * (f.defaultPct||0);
            else if (f.id === 'addl') f.amount = addl !== null ? addl : price * (f.defaultPct||0);
            else if (f.id === 'deliv') f.amount = deliv !== null ? deliv : price * (f.defaultPct||0);
            else if (f.isMerged) {
                let m_amt = 0;
                if (f.mergedIds.includes('deliv')) m_amt += deliv !== null ? deliv : price * 0.05;
                f.amount = m_amt; 
            }
            
            if (!f.isInst && f.id !== 'deliv' && !f.isMerged) remAmt -= f.amount;
            if (f.id === 'deliv' && !f.isMerged) remAmt -= f.amount;
        }
    });
    
    flows.forEach(f => {
        if (f.isMerged) {
            f._mergedAmt = f.amount;
            remAmt -= f.amount;
        }
        if (f.isBump) {
            f.bumpAmount = price * f.bumpPercent;
            f._bumpAmt = f.bumpAmount;
            remAmt -= f.bumpAmount;
        }
    });
    
    let dynamicInsts = flows.filter(f => f.isInst || f.isMerged);
    let instAmt = isFixedInst ? fixedInstVal : (remAmt / dynamicInsts.length);
    
    let is7030 = document.getElementById('toggle-70-30') && document.getElementById('toggle-70-30').checked;
    let freqMonths = parseInt(document.getElementById('payment-frequency').value) === 2 ? 6 : 3;
    let instsPerYear = 12 / freqMonths;
    let accumulatedWithheld = 0;
    let instIndex = 0;
    
    flows.forEach(f => {
        if (f.isInst || f.isMerged) {
            let currentInstAmt = instAmt;
            if (is7030 && !isFixedInst) {
                let isBumpInst = false;
                if (currentProject === 'Perla') {
                    isBumpInst = (f.months % 12 === 0 && f.months > 0);
                } else {
                    isBumpInst = (instIndex % instsPerYear === instsPerYear - 1);
                }
                let isLastInst = (instIndex === dynamicInsts.length - 1);
                
                if (isBumpInst || isLastInst) {
                    currentInstAmt = instAmt + accumulatedWithheld;
                    accumulatedWithheld = 0;
                } else {
                    currentInstAmt = instAmt * 0.7;
                    accumulatedWithheld += (instAmt * 0.3);
                }
            }
            
            f.amount = currentInstAmt + (f._mergedAmt || 0) + (f._bumpAmt || 0);
            f.isPct = false;
            
            if (overrides[f.id] && overrides[f.id].amount !== undefined) {
                let ov = overrides[f.id];
                f.amount = ov.isPct ? price * (ov.amount / 100) : ov.amount;
                f.isFixedOverride = true;
            }
            
            instIndex++;
        }
        
        applyDiscountLogic(f);
    });
    
    return flows;
}

function applyPerfectPercentages(flows, totalAmt) {
    flows.forEach(f => {
        if (!f.isMnt) {
            f.exactPct = f.amount / totalAmt;
            let pct = f.exactPct * 100;
            f.displayPct = parseFloat(pct.toFixed(7)).toString();
        } else {
            f.exactPct = 0.04;
            f.displayPct = '4';
        }
    });
    return flows;
}

function calculate() {
    try {
        let contractDateStr = document.getElementById('contract-date').value;
        if (!contractDateStr) return;
        
        let years = parseInt(document.getElementById('duration-years').value) || 8;
        let freqMonths = parseInt(document.getElementById('payment-frequency').value) === 2 ? 6 : 3;
        
        let basePriceStr = document.getElementById('base-price').value;
        if(!basePriceStr) return;
        let basePrice = parseFloat(basePriceStr.replace(/,/g, '')) || 0;
        
        basePriceCache = basePrice;
        
        let baseYears = parseInt(document.getElementById('base-duration-years').value) || 8;
        let baseFreq = parseInt(document.getElementById('base-payment-frequency').value) === 2 ? 6 : 3;
        
        let baseTemplate = generateFlowsTemplate(contractDateStr, baseYears, baseFreq, true);
        let baseFlows = calculateBaseFlows(basePrice, baseTemplate);
        basePvCache = baseFlows.filter(f => !f.isMnt).reduce((sum, f) => sum + f.pv, 0); // Exclude Mnt from NPV
        
        baseFlows = applyPerfectPercentages(baseFlows, basePrice);
        
        let baseDeliv = baseFlows.find(f => f.id === 'deliv' || (f.mergedIds && f.mergedIds.includes('deliv')));
        let baseDelivMonths = baseDeliv ? baseDeliv.months : 37;
        let basePreDelivAmt = baseFlows.filter(f => !f.isMnt && f.months <= baseDelivMonths).reduce((sum, f) => sum + f.amount, 0);
        let basePreDelivPct = basePrice > 0 ? (basePreDelivAmt / basePrice) * 100 : 0;
        
        document.getElementById('base-total-amt').innerText = formatCurr(basePrice);
        document.getElementById('base-total-pv').innerText = formatCurr(basePvCache);
        if(document.getElementById('base-pre-delivery')) document.getElementById('base-pre-delivery').innerText = basePreDelivPct.toFixed(2) + '%';
        
        renderTable(baseFlows, 'base-tbody');
        
        let customTemplate = generateFlowsTemplate(contractDateStr, years, freqMonths);
        
        let targetPriceStr = document.getElementById('target-price-val') ? document.getElementById('target-price-val').value : '';
        let isFixedInst = document.getElementById('fixed-inst-toggle') && document.getElementById('fixed-inst-toggle').checked;
        let fixedInstVal = document.getElementById('fixed-inst-val') ? parseFloat(document.getElementById('fixed-inst-val').value) : 0;
        
        let targetPrice = parseFloat(targetPriceStr);
        let hasTargetPrice = targetPriceStr.trim() !== '' && !isNaN(targetPrice);
        let hasFixedInst = isFixedInst && fixedInstVal > 0;
        
        let bestPrice = basePriceCache;

        if (hasTargetPrice) bestPrice = targetPrice;
        else if (hasFixedInst) bestPrice = basePriceCache;
        else bestPrice = solveForPrice(basePvCache, customTemplate);
        
        globalCustomFlows = calculateCustomFlows(bestPrice, customTemplate);
        
        let actualPrice = globalCustomFlows.filter(f => !f.isMnt).reduce((sum, f) => sum + f.amount, 0);
        globalCustomFlows = applyPerfectPercentages(globalCustomFlows, actualPrice);
        
        let offerPv = globalCustomFlows.filter(f => !f.isMnt).reduce((sum, f) => sum + f.pv, 0);
        
        let offerDeliv = globalCustomFlows.find(f => f.id === 'deliv' || (f.mergedIds && f.mergedIds.includes('deliv')));
        let offerDelivMonths = offerDeliv ? offerDeliv.months : 37;
        let offerPreDelivAmt = globalCustomFlows.filter(f => !f.isMnt && f.months <= offerDelivMonths).reduce((sum, f) => sum + f.amount, 0);
        let offerPreDelivPct = actualPrice > 0 ? (offerPreDelivAmt / actualPrice) * 100 : 0;
        
        document.getElementById('offer-total-amt').innerText = formatCurr(actualPrice);
        document.getElementById('offer-total-pv').innerText = formatCurr(offerPv);
        if(document.getElementById('offer-pre-delivery')) document.getElementById('offer-pre-delivery').innerText = offerPreDelivPct.toFixed(2) + '%';
        
        renderTable(globalCustomFlows, 'offer-tbody');
        generateExportTemplate(actualPrice, offerPreDelivPct);
        
        let diffEl = document.getElementById('pv-difference');
        let priceDiff = bestPrice - basePrice;
        
        if (Math.abs(priceDiff) < 10) {
            diffEl.innerHTML = `<span style="color:var(--success)">✅ Match Baseline NPV perfectly</span>`;
        } else {
            let isIncrease = priceDiff > 0;
            let diffPct = Math.abs(priceDiff / basePrice * 100).toFixed(2);
            let color = isIncrease ? 'var(--success)' : 'var(--danger)';
            let text = isIncrease ? 'Increase %' : 'Discount %';
            
            diffEl.innerHTML = `
                <div style="color:${color}; font-size: 1.3rem;">${text}: ${diffPct}%</div>
                <div style="color:${color}; font-size: 1rem; margin-top:5px;">Amount: ${formatCurr(Math.abs(priceDiff))}</div>
            `;
        }
        
        generateExportTemplate(actualPrice);
    } catch (e) {
        console.error('SafeGuard: Calculation Error prevented crash', e);
        alert("CRASH LOG: " + e.message + "\\nLine: " + e.stack);
    }
}

function renderTable(flows, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';
    
    let totalAmt = 0;
    let totalPv = 0;
    
    let nonMntFlows = flows.filter(f => !f.isMnt);
    nonMntFlows.forEach((cf) => {
        let tr = document.createElement('tr');
        let displayPct = cf.displayPct;
        
        if (tbodyId === 'base-tbody') {
            tr.innerHTML = `
                <td style="text-align:left">${cf.label}</td>
                <td>${cf.date}</td>
                <td>${displayPct}%</td>
                <td style="color:var(--accent-blue); font-weight:bold;">${formatCurr(cf.amount)}</td>
                <td style="color:var(--gold); font-weight:bold;">${formatCurr(cf.pv)}</td>
            `;
            tbody.appendChild(tr);
            totalAmt += cf.amount;
            totalPv += cf.pv;
        } else {
            tr.innerHTML = `
                <td style="text-align:left">${cf.label}</td>
                <td><input type="text" style="width:90px;" class="tbl-input tbl-date" value="${cf.date}"></td>
                <td><input type="number" step="0.01" style="width:60px;" class="tbl-input tbl-pct" value="${displayPct}">%</td>
                <td><input type="number" style="width:90px; color:var(--accent-blue); font-weight:bold;" class="tbl-input tbl-amt" value="${Math.round(cf.amount)}"></td>
                <td style="color:var(--gold); font-weight:bold;" class="tbl-pv">${formatCurr(cf.pv)}</td>
            `;
            tbody.appendChild(tr);
            totalAmt += cf.amount;
            totalPv += cf.pv;
        }
    });
    
    let trTotal = document.createElement('tr');
    trTotal.style.backgroundColor = '#e2efda';
    trTotal.innerHTML = `
        <td style="text-align:right; font-weight:bold;">Total Payments:</td>
        <td></td>
        <td style="font-weight:bold;">100.00%</td>
        <td style="color:var(--accent-blue); font-weight:bold;">${formatCurr(totalAmt)}</td>
        <td style="color:var(--gold); font-weight:bold;">${formatCurr(totalPv)}</td>
    `;
    tbody.appendChild(trTotal);
}

window.applyTableEdits = function() {
    let tbody = document.getElementById('offer-tbody');
    if (!window.globalTableOverrides) window.globalTableOverrides = {};
    
    let nonMntFlows = globalCustomFlows.filter(f => !f.isMnt);
    
    Array.from(tbody.rows).forEach((tr, i) => {
        if(i >= nonMntFlows.length) return;
        
        let f = nonMntFlows[i];
        
        let dateInput = tr.querySelector('.tbl-date');
        let pctInput = tr.querySelector('.tbl-pct');
        let amtInput = tr.querySelector('.tbl-amt');
        
        if (dateInput) {
            if (!window.globalTableOverrides[f.id]) window.globalTableOverrides[f.id] = {};
            window.globalTableOverrides[f.id].date = dateInput.value;
        }
        
        if (amtInput && pctInput) {
            let currentAmt = Math.round(f.amount);
            let currentPct = parseFloat(f.displayPct) || 0;
            
            let typedAmt = parseFloat(amtInput.value.replace(/,/g, '')) || 0;
            let typedPct = parseFloat(pctInput.value) || 0;
            
            if (!window.globalTableOverrides[f.id]) window.globalTableOverrides[f.id] = {};
            
            if (typedAmt !== currentAmt) {
                window.globalTableOverrides[f.id].amount = typedAmt;
                window.globalTableOverrides[f.id].isPct = false;
            } else if (typedPct !== currentPct) {
                window.globalTableOverrides[f.id].amount = typedPct;
                window.globalTableOverrides[f.id].isPct = true;
            }
        }
    });
    
    calculate();
};

window.resetTableEdits = function() {
    window.globalTableOverrides = {};
    calculate();
};

// --- PDF & Excel Export Template Generator ---
function generateExportTemplate(offerPrice, offerPreDelivPct) {
    let years = parseInt(document.getElementById('duration-years').value);
    let mntTotal = offerPrice * 0.08;
    let incPct = (offerPrice - basePriceCache) / basePriceCache;
    
    let html = `
        <colgroup>
            <col style="width: 12%;">
            <col style="width: 33%;">
            <col style="width: 10%;">
            <col style="width: 25%;">
            <col style="width: 20%;">
        </colgroup>
        <tr><th colspan="5" class="export-header-blue" style="font-size: 11px; border: 2px solid black; padding: 2px;">Payment Plan ${years} Years</th></tr>
        <tr><td colspan="2" class="export-bold" style="text-align: left; border-left: 2px solid black;">Unit No :</td><td colspan="3" style="border-right: 2px solid black;"></td></tr>
        <tr><td colspan="2" class="export-bold" style="text-align: left; border-left: 2px solid black;">Unit Base Price :</td><td colspan="3" style="border-right: 2px solid black;">${formatNum(basePriceCache)}</td></tr>
        <tr><td colspan="2" class="export-bold" style="text-align: left; border-left: 2px solid black;">Maintenance :</td><td colspan="3" style="border-right: 2px solid black;">${formatNum(mntTotal)}</td></tr>
        <tr><td colspan="2" class="export-bold" style="text-align: left; border-left: 2px solid black;">increase % :</td><td colspan="3" style="border-right: 2px solid black;">${formatPct(incPct)}</td></tr>
        <tr><td colspan="2" class="export-bold" style="text-align: left; border-left: 2px solid black;">Price After increase :</td><td colspan="3" class="export-bold" style="border-right: 2px solid black;">${formatNum(offerPrice)}</td></tr>
        <tr><td colspan="2" class="export-bold" style="text-align: left; border-left: 2px solid black; border-bottom: 2px solid black;">Collected Till Delivery:</td><td colspan="3" class="export-bold" style="border-right: 2px solid black; border-bottom: 2px solid black;">${(offerPreDelivPct || 0).toFixed(2)}%</td></tr>
        <tr><td colspan="5" style="height: 5px; border: none;"></td></tr>
        
        <tr>
            <th colspan="2" class="export-header-blue" style="border: 2px solid black; padding: 2px;">Payment Terms & Types</th>
            <th colspan="3" class="export-header-blue" style="border: 2px solid black; padding: 2px;">${years} Years Payment Plan</th>
        </tr>
        <tr>
            <th colspan="2" class="export-header-blue" style="border-left: 2px solid black; border-bottom: 2px solid black;"></th>
            <th class="export-header-blue" style="border-bottom: 2px solid black;">%</th>
            <th class="export-header-blue" style="border-bottom: 2px solid black;">Unit Price :</th>
            <th class="export-header-blue" style="border-right: 2px solid black; border-bottom: 2px solid black;">Date</th>
        </tr>
    `;
    
    let nonMntFlows = globalCustomFlows.filter(f => !f.isMnt);
    
    let grouped = [];
    nonMntFlows.forEach(f => {
        let grpName = '';
        if (f.months <= 1 && f.isDP) grpName = 'Down Payment';
        else {
            let y = Math.floor(f.months / 12) + 1;
            grpName = 'Year ' + y;
        }
        let lastGrp = grouped[grouped.length - 1];
        if (lastGrp && lastGrp.name === grpName) {
            lastGrp.items.push(f);
        } else {
            grouped.push({ name: grpName, items: [f] });
        }
    });
    
    grouped.forEach((grp, gIdx) => {
        let isLastGrp = gIdx === grouped.length - 1;
        grp.items.forEach((item, iIdx) => {
            let isLastItem = iIdx === grp.items.length - 1;
            let bottomBorder = isLastItem ? 'border-bottom: 1px solid black;' : 'border-bottom: 1px dotted black;';
            if (isLastGrp && isLastItem) bottomBorder = 'border-bottom: 2px solid black;';
            
            html += `<tr>`;
            if (iIdx === 0) {
                let cellStyle = `border-left: 2px solid black; border-bottom: 1px solid black; border-right: 1px solid black; vertical-align: middle;`;
                if (isLastGrp) cellStyle += ` border-bottom: 2px solid black;`;
                if (grp.name === 'Down Payment') {
                    // Span 2 columns, no inner text for second col
                    html += `<td rowspan="${grp.items.length}" colspan="2" class="export-bold" style="${cellStyle} text-align: center;">${grp.name}</td>`;
                } else {
                    html += `<td rowspan="${grp.items.length}" class="export-bold" style="${cellStyle} text-align: center;">${grp.name}</td>`;
                }
            }
            if (grp.name !== 'Down Payment') {
                html += `<td style="${bottomBorder} border-right: 1px dotted black; text-align: center;">${item.label}</td>`;
            }
            html += `<td style="${bottomBorder} border-right: 1px dotted black;">${item.displayPct}%</td>`;
            html += `<td style="${bottomBorder} border-right: 1px dotted black;">${formatNum(item.amount)}</td>`;
            html += `<td class="export-bold" style="border-right: 2px solid black; ${bottomBorder}">${formatDateExport(item.date)}</td>`;
            html += `</tr>`;
        });
    });
    
    html += `<tr>
        <td colspan="2" class="export-header-blue" style="border-left: 2px solid black; border-bottom: 2px solid black; text-align: center;">Total Amount</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black;">100.00%</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black;">${formatNum(offerPrice)}</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black; border-right: 2px solid black;"></td>
    </tr>`;
    
    html += `<tr><td colspan="5" style="height: 10px; border: none;"></td></tr>`;
    
    html += `<tr><th colspan="2" class="export-header-blue" style="border-left: 2px solid black; border-top: 2px solid black; border-bottom: 2px solid black;">Maintenance Payments</th><th colspan="3" style="border-right: 2px solid black; border-top: 2px solid black; border-bottom: 2px solid black;"></th></tr>`;
    
    let mntFlows = globalCustomFlows.filter(f => f.isMnt);
    let totalMntAmt = 0;
    mntFlows.forEach((m, i) => {
        totalMntAmt += m.amount;
        let isLastMnt = i === mntFlows.length - 1;
        let bottomBorder = isLastMnt ? 'border-bottom: 2px solid black;' : 'border-bottom: 1px dotted black;';
        html += `<tr>
            <td colspan="2" style="border-left: 2px solid black; border-right: 1px dotted black; ${bottomBorder}">Maintenance 0${i+1}</td>
            <td style="${bottomBorder} border-right: 1px dotted black;">${parseFloat(m.displayPct).toFixed(2)}%</td>
            <td style="${bottomBorder} border-right: 1px dotted black;">${formatNum(m.amount)}</td>
            <td style="border-right: 2px solid black; ${bottomBorder}">${formatDateExport(m.date)}</td>
        </tr>`;
    });
    
    html += `<tr>
        <td colspan="2" class="export-header-blue" style="border-left: 2px solid black; border-bottom: 2px solid black; text-align: center;">Total Maintenance</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black;">8.00%</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black;">${formatNum(totalMntAmt)}</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black; border-right: 2px solid black;"></td>
    </tr>`;
    
    document.getElementById('export-table').innerHTML = html;
}

// --- Export ---
function exportPDF() {
    try {
        let element = document.getElementById('export-wrapper');
        element.style.left = '0';
        element.style.position = 'relative';
        
        let opt = {
            margin:       0.2, 
            filename:     `Payment_Plan_${currentProject}.pdf`,
            image:        { type: 'jpeg', quality: 1.0 },
            html2canvas:  { scale: 3 },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: 'avoid-all' }
        };
        
        html2pdf().set(opt).from(element).save().then(function() {
            element.style.left = '-9999px';
            element.style.position = 'absolute';
        });
    } catch (e) {
        console.error('SafeGuard: PDF Export Error prevented crash', e);
        alert('حدث خطأ أثناء تصدير الـ PDF. تأكد من إدخال جميع البيانات.');
    }
}

function exportExcel() {
    let elt = document.getElementById('export-table');
    let wb = XLSX.utils.table_to_book(elt, {sheet:"Payment Plan"});
    XLSX.writeFile(wb, `Payment_Plan_${currentProject}.xlsx`);
}

// --- Rates Modal ---
function openRatesModal() {
    let html = '';
    for(let i=0; i<=15; i++) {
        html += `<div class="input-group">
            <label>Year ${i}</label>
            <input type="number" id="rate-${i}" value="${discountRates[i]}">
        </div>`;
    }
    document.getElementById('rates-container').innerHTML = html;
    document.getElementById('rates-modal').classList.add('active');
}
function closeRatesModal() { document.getElementById('rates-modal').classList.remove('active'); }
function saveRates() {
    for(let i=0; i<=15; i++) {
        discountRates[i] = parseFloat(document.getElementById(`rate-${i}`).value) || 0;
    }
    closeRatesModal();
    calculate();
}

// Init
(function() {
    document.getElementById('contract-date').value = formatDate(new Date());
    renderBaseInputs();
    renderCustomInputs();
    calculate();
})();

async function handleTemplateUpload(event) {
    try {
        const file = event.target.files[0];
        if (!file) return;
        
        let offerAmtText = document.getElementById('offer-total-amt').innerText;
        let offerPrice = parseFloat(offerAmtText.replace(/[^0-9.-]+/g,""));
        let incPct = (offerPrice - basePriceCache) / basePriceCache;
        let mntTotal = offerPrice * 0.08;
    let years = parseInt(document.getElementById('duration-years').value);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const buffer = e.target.result;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const ws = workbook.worksheets[0];
        
        ws.getCell('F4').value = basePriceCache;
        ws.getCell('F5').value = mntTotal;
        ws.getCell('F6').value = incPct;
        ws.getCell('F7').value = offerPrice;
        
        ws.getCell('D2').value = `Payment Plan ${years} Years`;
        ws.getCell('G9').value = `${years} Years Payment Plan`;
        
        let nonMntFlows = globalCustomFlows.filter(f => !f.isMnt);
        let mnts = globalCustomFlows.filter(f => f.isMnt);
        
        let grouped = [];
        nonMntFlows.forEach(f => {
            let grpName = '';
            if (f.months <= 1 && f.isDP) grpName = 'Down Payment';
            else {
                let y = Math.floor(f.months / 12) + 1;
                grpName = 'Year ' + y;
            }
            let lastGrp = grouped[grouped.length - 1];
            if (lastGrp && lastGrp.name === grpName) {
                lastGrp.items.push(f);
            } else {
                grouped.push({ name: grpName, items: [f] });
            }
        });
        
        let excelTotalAmt = 0;
        
        for(let r=11; r<=53; r++) {
            let row = ws.getRow(r);
            [4,5,6,7,8,9].forEach(c => row.getCell(c).value = null);
            row.commit();
        }
        
        let rowIdx = 11;
        
        function writeRow(idx, colD, colF, colG, colH, colI) {
            const row = ws.getRow(idx);
            if (colD !== null) row.getCell(4).value = colD;
            if (colF !== null) row.getCell(6).value = colF;
            if (colG !== null) {
                let c = row.getCell(7);
                c.value = colG / 100.0;
                c.numFmt = '0.00%';
            }
            if (colH !== null) {
                let c = row.getCell(8);
                c.value = colH;
                c.numFmt = '#,##0.00';
            }
            if (colI !== null) row.getCell(9).value = colI; // Date
            
            let borderStyle = { style: 'thin', color: { argb: 'FF000000' } };
            let border = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };
            [4,5,6,7,8,9].forEach(c => {
                let cell = row.getCell(c);
                if(!cell.border) cell.border = border;
            });
            row.commit();
        }
        
        grouped.forEach(grp => {
            grp.items.forEach((item, j) => {
                let isFirst = j === 0;
                writeRow(rowIdx++, isFirst ? grp.name : null, item.label, parseFloat(item.displayPct), item.amount, formatDateExport(item.date));
                excelTotalAmt += item.amount;
            });
        });
        
        // Write Total exactly at Row 54 as requested by the user
        const totalRow = ws.getRow(54);
        totalRow.getCell(7).value = 1.0; // 100%
        totalRow.getCell(7).numFmt = '0.00%';
        totalRow.getCell(8).value = excelTotalAmt;
        totalRow.getCell(8).numFmt = '#,##0.00';
        totalRow.commit();
        
        // Write Maintenance into specific template rows (59, 60, etc.)
        let mntRowIdx = 59;
        let excelMntSum = 0;
        let mntTotalPct = 0;
        mnts.forEach((m, i) => {
            let mntRow = ws.getRow(mntRowIdx++);
            mntRow.getCell(4).value = `Maintenance 0${i+1}`;
            mntRow.getCell(5).value = parseFloat(m.displayPct) / 100.0;
            mntRow.getCell(5).numFmt = '0.00%';
            mntRow.getCell(6).value = m.amount;
            mntRow.getCell(6).numFmt = '#,##0.00';
            mntRow.getCell(7).value = formatDateExport(m.date);
            mntRow.commit();
            excelMntSum += m.amount;
            mntTotalPct += parseFloat(m.displayPct);
        });
        
        // Write Total Maintenance at row 62
        let mntTotalRow = ws.getRow(62);
        mntTotalRow.getCell(5).value = mntTotalPct / 100.0;
        mntTotalRow.getCell(5).numFmt = '0.00%';
        mntTotalRow.getCell(6).value = excelMntSum;
        mntTotalRow.getCell(6).numFmt = '#,##0.00';
        mntTotalRow.commit();
        
        const outBuffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Payment_Plan_${currentProject}_Template.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
    } catch (e) {
        console.error('SafeGuard: Excel Upload Error prevented crash', e);
        alert('حدث خطأ أثناء قراءة قالب الإكسيل.');
    }
}



window.onTargetPriceChange = function() {
    calculate();
    if (typeof window.generateSmartOptions === 'function') {
        window.generateSmartOptions();
    }
};

window.generateSmartOptions = function() {
    let targetPriceStr = document.getElementById('target-price-val') ? document.getElementById('target-price-val').value : '';
    let isFixedInst = document.getElementById('fixed-inst-toggle') && document.getElementById('fixed-inst-toggle').checked;
    let fixedInstVal = document.getElementById('fixed-inst-val') ? parseFloat(document.getElementById('fixed-inst-val').value) : 0;
    
    let container = document.getElementById('smart-options-container');
    let targetPrice = parseFloat(targetPriceStr);
    let hasTargetPrice = targetPriceStr.trim() !== '' && !isNaN(targetPrice);
    let hasFixedInst = isFixedInst && fixedInstVal > 0;
    
    if (!hasTargetPrice && !hasFixedInst) {
        if (container) container.style.display = 'none';
        window.activeSmartOption = null;
        return;
    }
    
    if (window.activeSmartOption && window.aiOptionsCache) {
        if (container) container.style.display = 'block';
        let optId = window.activeSmartOptionId;
        let optHtml = window.aiOptionsCache[optId] ? window.aiOptionsCache[optId].html : '\u0627\u0644\u062e\u064a\u0627\u0631 \u0627\u0644\u0645\u0637\u0628\u0642';
        
        let html = '<h4 style="color:#0078D7; margin-bottom: 15px;">\ud83e\udd16 \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0630\u0643\u064a\u0629 (NPV \u062b\u0627\u0628\u062a)</h4><div style="display:flex; flex-direction:column; gap:10px;">';
        let activeDiv = optHtml.replace(/onclick="[^"]*"/, 'style="background: var(--accent-blue); color: white; border: 2px solid var(--accent-blue); padding: 15px; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: default;"');
        html += activeDiv;
        html += `<button onclick="resetSmartOptions()" style="margin-top: 15px; padding: 12px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold; font-size: 0.95rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: all 0.2s;">\u274c \u0627\u0644\u062a\u0631\u0627\u062c\u0639 \u0648\u062a\u062c\u0631\u0628\u0629 \u062e\u064a\u0627\u0631\u0627\u062a \u0630\u0643\u064a\u0629 \u0623\u062e\u0631\u0649</button>`;
        html += '</div>';
        if (container) container.innerHTML = html;
        return;
    }
    
    if (container) container.style.display = 'block';
    let currentYrs = parseInt(document.getElementById('duration-years').value) || 8;
    let freqMonths = parseInt(document.getElementById('payment-frequency').value) === 2 ? 6 : 3;
    let dStr = document.getElementById('contract-date').value || new Date();
    
    let anchorPv = basePvCache || 0;
    if (anchorPv === 0) return;
    
    let html = '<h4 style="color:#0078D7; margin-bottom: 5px;">\ud83d\udca1 \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0630\u0643\u064a\u0629 (NPV \u062b\u0627\u0628\u062a)</h4>';
    html += '<p style="color:#555; font-size:0.85rem; margin-bottom: 15px; line-height: 1.4;">\u0627\u062e\u062a\u0631 \u0623\u062d\u062f \u0627\u0644\u062d\u0644\u0648\u0644 \u0627\u0644\u0631\u064a\u0627\u0636\u064a\u0629 \u0627\u0644\u062a\u0627\u0644\u064a\u0629 \u0644\u0644\u062d\u0641\u0627\u0638 \u0639\u0644\u0649 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0644\u0644\u0634\u0631\u0643\u0629 \u0628\u062f\u0648\u0646 \u062e\u0635\u0645 \u0648\u0647\u0645\u064a.</p>';
    html += '<div style="display:flex; flex-direction:column; gap:12px;">';
    
    window.aiOptionsCache = {};
    let optionsFound = 0;
    
    if (hasTargetPrice && !hasFixedInst) {
        
        let durOptions = [];
        for (let i = 1; i <= 60; i++) {
            let testTpl = generateFlowsTemplate(dStr, 1, freqMonths);
            testTpl = testTpl.filter(t => !t.isInst && !t.isMerged);
            let startMonths = 6;
            for(let j=0; j<i; j++) {
                testTpl.push({ isInst: true, isBump: false, months: startMonths + (j * freqMonths), label: 'Installment' });
            }
            
            let reqPrice = solveForPrice(anchorPv, testTpl);
            let exactFlows = calculateCustomFlows(reqPrice, testTpl);
            let firstInst = exactFlows.find(f => f.isInst);
            let instAmt = firstInst ? firstInst.amount : 0;
            durOptions.push({ instCount: i, price: reqPrice, instAmt: instAmt });
        }
        
        durOptions.sort((a,b) => Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice));
        let topDurs = durOptions.slice(0, 2);
        topDurs.forEach((opt, idx) => {
            let totalMonths = 6 + ((opt.instCount - 1) * freqMonths);
            let exactYrs = (totalMonths / 12).toFixed(2).replace('.00', '');
            let isExact = Math.abs(opt.price - targetPrice) < 1000;
            let title = isExact ? `\u23f3 \u062a\u0642\u0644\u064a\u0644 \u0627\u0644\u0645\u062f\u0629 \u0625\u0644\u0649 ${exactYrs} \u0633\u0646\u0648\u0627\u062a (\u0633\u0639\u0631 \u062f\u0642\u064a\u0642)` : `\u23f3 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u062f\u0629 \u0625\u0644\u0649 ${exactYrs} \u0633\u0646\u0648\u0627\u062a`;
            
            let durHtml = `<div class="smart-option" onclick="applySmartOption('dur_${idx}')">
                <div style="font-size: 1.05rem; margin-bottom: 5px;"><strong>${title}</strong></div>
                <div style="font-size: 0.85rem; color: #444; line-height: 1.5;">
                    \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0633\u064a\u0643\u0648\u0646 <b>${formatCurr(opt.price)}</b> (\u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u0640 ${formatCurr(targetPrice)} \u0645\u0637\u0644\u0648\u0628\u0629).<br>
                    \u0627\u0644\u0645\u0628\u0644\u063a \u0644\u0642\u0633\u0637 \u0648\u0627\u062d\u062f \u0633\u064a\u0643\u0648\u0646 <b>${formatCurr(opt.instAmt)}</b>.
                </div>
            </div>`;
            window.aiOptionsCache[`dur_${idx}`] = { type: 'duration', instCount: opt.instCount, price: opt.price, html: durHtml };
            html += durHtml;
            optionsFound++;
        });
        
        let tplDP = generateFlowsTemplate(dStr, currentYrs, freqMonths);
        let dpNode = tplDP.find(t => t.id === 'dp1');
        if (dpNode) {
            let lowDP = 0.0, highDP = 0.95, bestDP = 0.05;
            for (let iter=0; iter<40; iter++) {
                let midDP = (lowDP + highDP) / 2;
                dpNode.defaultPct = midDP;
                let testPv = calculateCustomFlows(targetPrice, tplDP).filter(f => !f.isMnt).reduce((sum, f) => sum + f.pv, 0);
                if (testPv > anchorPv) highDP = midDP;
                else lowDP = midDP;
                bestDP = midDP;
            }
            if (Math.abs(calculateCustomFlows(targetPrice, tplDP).filter(f => !f.isMnt).reduce((sum, f) => sum + f.pv, 0) - anchorPv) < 1000) {
                let dpAmt = targetPrice * bestDP;
                let dpHtml = `<div class="smart-option" onclick="applySmartOption('dp')">
                    <div style="font-size: 1.05rem; margin-bottom: 5px;"><strong>\ud83d\udcb0 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0642\u062f\u0645 \u0644\u064a\u0643\u0648\u0646 ${(bestDP*100).toFixed(2)}%</strong></div>
                    <div style="font-size: 0.85rem; color: #444; line-height: 1.5;">
                        \u064a\u062d\u0642\u0642 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641 <b>${formatCurr(targetPrice)}</b> \u0628\u0627\u0644\u0636\u0628\u0637!<br>
                        \u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0642\u062f\u0645 \u0627\u0644\u062c\u062f\u064a\u062f: <b>${formatCurr(dpAmt)}</b>.
                    </div>
                </div>`;
                window.aiOptionsCache['dp'] = { type: 'dp', dpPercent: bestDP, price: targetPrice, html: dpHtml };
                html += dpHtml;
                optionsFound++;
            }
        }
        
        let tplAnn = generateFlowsTemplate(dStr, currentYrs, freqMonths);
        let lowA = 0.0, highA = 0.5, bestA = 0.0;
        for (let iter=0; iter<40; iter++) {
            let midA = (lowA + highA) / 2;
            for(let k=0; k<tplAnn.length; k++) {
                if (tplAnn[k].isInst && tplAnn[k].months % 12 === 0 && tplAnn[k].months >= 12) {
                    tplAnn[k].isBump = true; tplAnn[k].bumpPercent = midA;
                }
            }
            let testPv = calculateCustomFlows(targetPrice, tplAnn).filter(f => !f.isMnt).reduce((sum, f) => sum + f.pv, 0);
            if (testPv > anchorPv) highA = midA;
            else lowA = midA;
            bestA = midA;
        }
        if (Math.abs(calculateCustomFlows(targetPrice, tplAnn).filter(f => !f.isMnt).reduce((sum, f) => sum + f.pv, 0) - anchorPv) < 1000 && bestA > 0.005) {
            let annHtml = `<div class="smart-option" onclick="applySmartOption('ann_12')">
                <div style="font-size: 1.05rem; margin-bottom: 5px;"><strong>\ud83d\udcc5 \u0625\u0636\u0627\u0641\u0629 \u062f\u0641\u0639\u0629 \u0633\u0646\u0648\u064a\u0629 \u0628\u0646\u0633\u0628\u0629 ${(bestA*100).toFixed(2)}%</strong></div>
                <div style="font-size: 0.85rem; color: #444; line-height: 1.5;">
                    \u064a\u062d\u0642\u0642 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641 <b>${formatCurr(targetPrice)}</b> \u0628\u0627\u0644\u0636\u0628\u0637 \u0645\u0639 \u062a\u062b\u0628\u064a\u062a \u0628\u0627\u0642\u064a \u0627\u0644\u0645\u062a\u063a\u064a\u0631\u0627\u062a.
                </div>
            </div>`;
            window.aiOptionsCache['ann_12'] = { type: 'annual', month: 12, annPercent: bestA, price: targetPrice, html: annHtml };
            html += annHtml;
            optionsFound++;
        }
    }
    
    html += '</div>';
    
    if (container) {
        if (optionsFound === 0) {
            container.innerHTML = '<div style="color:var(--danger); padding:10px; border:1px solid var(--danger); border-radius:5px;">\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0644\u0648\u0644 \u0631\u064a\u0627\u0636\u064a\u0629 \u0645\u062a\u0627\u062d\u0629\u060c \u062c\u0631\u0628 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0633\u0639\u0631 \u0642\u0644\u064a\u0644\u0627\u064b \u0623\u0648 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0645\u0639\u0637\u064a\u0627\u062a.</div>';
        } else {
            container.innerHTML = html;
        }
    }
};

window.applySmartOption = function(id) {
    let opt = window.aiOptionsCache[id];
    if (!opt) return;
    
    window.activeSmartOption = opt; 
    window.activeSmartOptionId = id;
    
    if (document.getElementById('target-price-val')) {
        document.getElementById('target-price-val').value = Math.round(opt.price);
    }
    
    calculate();
    if (typeof window.generateSmartOptions === 'function') {
        window.generateSmartOptions();
    }
};

window.resetSmartOptions = function() {
    window.activeSmartOption = null;
    window.activeSmartOptionId = null;
    window.globalTableOverrides = {};
    calculate();
    if (typeof window.generateSmartOptions === 'function') {
        window.generateSmartOptions();
    }
};
