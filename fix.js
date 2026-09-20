const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const targetLine = "    html += `<tr><th colspan=\"2\" class=\"export-header-blue\" style=\"border-left: 2px solid black; border-top: 2px solid black; border-bottom: 2px solid black;\">Maintenance Payments</th><th colspan=\"3\" style=\"border-right: 2px solid black; border-top: 2px solid black; border-bottom: 2px solid black;\"></th></tr>`;";

const endLine = "        html2pdf().set(opt).from(element).save().then(function() {";

const parts = content.split(targetLine);
if (parts.length === 2) {
    const afterTarget = parts[1];
    const indexEnd = afterTarget.indexOf(endLine);
    if (indexEnd !== -1) {
        const newCode = `
    let mntFlows = globalCustomFlows.filter(f => f.isMnt);
    let totalMntAmt = 0;
    mntFlows.forEach((m, i) => {
        totalMntAmt += m.amount;
        let isLastMnt = i === mntFlows.length - 1;
        let bottomBorder = isLastMnt ? 'border-bottom: 2px solid black;' : 'border-bottom: 1px dotted black;';
        html += \`<tr>
            <td colspan="2" style="border-left: 2px solid black; border-right: 1px dotted black; \${bottomBorder}">Maintenance 0\${i+1}</td>
            <td style="\${bottomBorder} border-right: 1px dotted black;">\${parseFloat(m.displayPct).toFixed(2)}%</td>
            <td style="\${bottomBorder} border-right: 1px dotted black;">\${formatNum(m.amount)}</td>
            <td style="border-right: 2px solid black; \${bottomBorder}">\${formatDateExport(m.date)}</td>
        </tr>\`;
    });
    
    html += \`<tr>
        <td colspan="2" class="export-header-blue" style="border-left: 2px solid black; border-bottom: 2px solid black; text-align: center;">Total Maintenance</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black;">8.00%</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black;">\${formatNum(totalMntAmt)}</td>
        <td class="export-header-blue" style="border-bottom: 2px solid black; border-right: 2px solid black;"></td>
    </tr>\`;
    
    document.getElementById('export-table').innerHTML = html;
}

// --- Export ---
function exportPDF() {
    try {
        let element = document.getElementById('export-wrapper');
        element.style.left = '0';
        element.style.position = 'relative';
        
        let widthIn = element.offsetWidth / 96;
        let heightIn = element.offsetHeight / 96;
        
        let opt = {
            margin:       0.2, 
            filename:     \`Payment_Plan_\${currentProject}.pdf\`,
            image:        { type: 'jpeg', quality: 0.8 },
            html2canvas:  { scale: 1.5 },
            jsPDF:        { unit: 'in', format: [widthIn + 0.5, heightIn + 0.5], orientation: 'portrait' }
        };
        
        // Force all gold to black for the PDF
        document.documentElement.style.setProperty('--gold', '#000000');
        
`;
        const finalContent = parts[0] + targetLine + "\n" + newCode + afterTarget.substring(indexEnd);
        fs.writeFileSync('app.js', finalContent);
        console.log("Fixed!");
    } else {
        console.log("endLine not found");
    }
} else {
    console.log("targetLine not found");
}
