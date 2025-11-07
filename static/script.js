// DOM元素
const valuationForm = document.getElementById('valuationForm');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultsSection = document.getElementById('resultsSection');
const useCustomGrowthCheckbox = document.getElementById('useCustomGrowth');
const customGrowthSection = document.getElementById('customGrowthSection');
const resetBtn = document.getElementById('resetBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');

// 全局变量存储当前估值数据
let currentValuationData = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
});

// 初始化事件监听器
function initializeEventListeners() {
    // 自定义增长率复选框
    useCustomGrowthCheckbox.addEventListener('change', (e) => {
        customGrowthSection.classList.toggle('hidden', !e.target.checked);
    });

    // 表单提交
    valuationForm.addEventListener('submit', handleFormSubmit);

    // 重置按钮
    resetBtn.addEventListener('click', resetForm);

    // 导出Excel按钮
    exportExcelBtn.addEventListener('click', exportToExcel);
}

// 处理表单提交
async function handleFormSubmit(e) {
    e.preventDefault();

    // 获取表单数据
    const ticker = document.getElementById('ticker').value.trim().toUpperCase();
    const perpetualGrowth = parseFloat(document.getElementById('perpetualGrowth').value) / 100;
    const useCustomGrowth = useCustomGrowthCheckbox.checked;

    // 验证输入
    if (!ticker) {
        showAlert('请输入股票代码', 'error');
        return;
    }

    // 获取自定义增长率
    let customGrowthRates = null;
    if (useCustomGrowth) {
        customGrowthRates = [];
        for (let i = 1; i <= 5; i++) {
            const value = document.getElementById(`growth${i}`).value;
            if (!value) {
                showAlert(`请输入第${i}年的增长率`, 'error');
                return;
            }
            customGrowthRates.push(parseFloat(value) / 100);
        }
    }

    // 显示加载指示器
    loadingIndicator.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    try {
        // 调用API
        const response = await fetch('/api/valuation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ticker: ticker,
                perpetualGrowth: perpetualGrowth,
                customGrowthRates: customGrowthRates
            })
        });

        const data = await response.json();

        if (data.success) {
            // 保存数据用于导出
            currentValuationData = {
                ticker: ticker,
                perpetualGrowth: perpetualGrowth,
                customGrowthRates: customGrowthRates
            };

            // 显示结果
            displayResults(data);
            showAlert('估值计算完成!', 'success');
        } else {
            showAlert(data.error || '估值计算失败', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('网络错误，请检查服务器是否运行', 'error');
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

// 显示结果
function displayResults(data) {
    // 主要结果
    document.getElementById('dcfValue').textContent = `$${data.valuationResults.valuePerShare.toFixed(2)}`;
    document.getElementById('currentPrice').textContent = `$${data.valuationResults.currentPrice.toFixed(2)}`;

    const premium = data.valuationResults.premiumDiscount;
    const premiumElement = document.getElementById('premiumDiscount');
    premiumElement.textContent = `${premium > 0 ? '+' : ''}${premium.toFixed(2)}%`;
    premiumElement.className = 'result-value ' + (premium > 0 ? 'text-success' : premium < 0 ? 'text-danger' : '');

    // 投资建议
    const recommendationElement = document.getElementById('recommendation');
    recommendationElement.textContent = data.recommendation;
    recommendationElement.className = 'result-value recommendation ' + getRecommendationClass(data.recommendation);

    // 企业价值详情
    document.getElementById('enterpriseValue').textContent = `$${data.valuationResults.enterpriseValue.toFixed(2)}B`;
    document.getElementById('equityValue').textContent = `$${data.valuationResults.equityValue.toFixed(2)}B`;
    document.getElementById('cash').textContent = `$${data.valuationResults.cash.toFixed(2)}B`;
    document.getElementById('debt').textContent = `$${data.valuationResults.debt.toFixed(2)}B`;
    document.getElementById('sharesOutstanding').textContent = `${data.valuationResults.sharesOutstanding.toFixed(2)}B股`;
    document.getElementById('wacc').textContent = `${data.valuationResults.wacc.toFixed(2)}%`;

    // WACC详情
    if (data.waccDetails) {
        document.getElementById('riskFreeRate').textContent = `${data.waccDetails.riskFreeRate.toFixed(2)}%`;
        document.getElementById('beta').textContent = data.waccDetails.beta.toFixed(4);
        document.getElementById('marketRiskPremium').textContent = `${data.waccDetails.marketRiskPremium.toFixed(2)}%`;
        document.getElementById('costOfEquity').textContent = `${data.waccDetails.costOfEquity.toFixed(2)}%`;
        document.getElementById('costOfDebt').textContent = `${data.waccDetails.costOfDebt.toFixed(2)}%`;
        document.getElementById('weightEquity').textContent = `${data.waccDetails.weightEquity.toFixed(2)}%`;
        document.getElementById('weightDebt').textContent = `${data.waccDetails.weightDebt.toFixed(2)}%`;
        document.getElementById('taxRate').textContent = `${data.waccDetails.taxRate.toFixed(1)}%`;
    }

    // 财务预测表
    if (data.forecast) {
        displayForecastTable(data.forecast);
    }

    // 敏感性分析
    if (data.sensitivity) {
        displaySensitivityMatrix(data.sensitivity);
    }

    // 显示结果区域
    resultsSection.classList.remove('hidden');

    // 平滑滚动到结果
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 显示财务预测表
function displayForecastTable(forecast) {
    const tbody = document.getElementById('forecastTableBody');
    tbody.innerHTML = '';

    forecast.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.year}</td>
            <td>$${row.revenue.toFixed(2)}B</td>
            <td>$${row.fcf.toFixed(2)}B</td>
            <td>${row.revenueGrowth.toFixed(1)}%</td>
            <td>${row.fcfMargin.toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    });
}

// 显示敏感性分析矩阵
function displaySensitivityMatrix(sensitivity) {
    const table = document.getElementById('sensitivityTable');
    table.innerHTML = '';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>永续增长率 / WACC</th>';
    sensitivity.columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');
    sensitivity.rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = row;
        tr.appendChild(th);

        sensitivity.values[i].forEach(value => {
            const td = document.createElement('td');
            td.textContent = `$${value.toFixed(2)}`;
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

// 获取推荐类别的CSS类
function getRecommendationClass(recommendation) {
    const map = {
        '强烈买入': 'text-success',
        '买入': 'text-success',
        '持有': 'text-warning',
        '卖出': 'text-danger',
        '强烈卖出': 'text-danger'
    };
    return map[recommendation] || '';
}

// 重置表单
function resetForm() {
    valuationForm.reset();
    customGrowthSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    useCustomGrowthCheckbox.checked = false;
    currentValuationData = null;
}

// 导出Excel
async function exportToExcel() {
    if (!currentValuationData) {
        showAlert('没有可导出的数据', 'error');
        return;
    }

    try {
        showAlert('正在生成Excel文件...', 'info');

        const response = await fetch('/api/export_excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentValuationData)
        });

        const data = await response.json();

        if (data.success) {
            // 下载文件
            window.location.href = `/api/download/${data.filename}`;
            showAlert('Excel文件已生成，正在下载...', 'success');
        } else {
            showAlert(data.error || '导出失败', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('导出失败: ' + error.message, 'error');
    }
}

// 显示提示消息
function showAlert(message, type = 'info') {
    // 简单的alert实现，可以替换为更好的UI组件
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };

    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
    `;
    alertDiv.textContent = message;

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
