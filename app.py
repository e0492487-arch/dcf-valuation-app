# -*- coding: utf-8 -*-
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import sys
import os
import json
from datetime import datetime

# 导入DCF估值模型
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from equity_valuation import DCFValuation

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/api/validate_ticker', methods=['POST'])
def validate_ticker():
    """验证股票代码"""
    try:
        data = request.json
        ticker = data.get('ticker', '').strip().upper()

        if not ticker:
            return jsonify({'valid': False, 'message': '股票代码不能为空'})

        # 创建临时DCF对象进行验证
        dcf = DCFValuation(ticker=ticker)
        is_valid = dcf.validate_ticker()

        return jsonify({
            'valid': is_valid,
            'message': '股票代码有效' if is_valid else '股票代码无效或无法获取数据'
        })
    except Exception as e:
        return jsonify({'valid': False, 'message': f'验证失败: {str(e)}'})

@app.route('/api/valuation', methods=['POST'])
def calculate_valuation():
    """执行DCF估值计算"""
    try:
        data = request.json
        ticker = data.get('ticker', '').strip().upper()
        perpetual_growth = float(data.get('perpetualGrowth', 0.025))
        custom_growth_rates = data.get('customGrowthRates')

        # 验证输入
        if not ticker:
            return jsonify({'success': False, 'error': '股票代码不能为空'})

        if not (0 < perpetual_growth < 0.1):
            return jsonify({'success': False, 'error': '永续增长率应在0和0.1之间'})

        # 处理自定义增长率
        growth_rates = None
        if custom_growth_rates:
            try:
                growth_rates = [float(x) for x in custom_growth_rates]
                if len(growth_rates) != 5:
                    return jsonify({'success': False, 'error': '必须提供5年的增长率'})
                if not all(0 <= r < 1 for r in growth_rates):
                    return jsonify({'success': False, 'error': '增长率必须在0和1之间'})
            except:
                return jsonify({'success': False, 'error': '增长率格式错误'})

        # 创建DCF估值模型
        dcf = DCFValuation(
            ticker=ticker,
            perpetual_growth_rate=perpetual_growth
        )

        # 执行估值
        results = dcf.comprehensive_valuation(growth_rates)

        if not results:
            return jsonify({'success': False, 'error': '估值计算失败，请检查输入参数'})

        # 准备返回数据
        response_data = {
            'success': True,
            'ticker': ticker,
            'valuationResults': {
                'valuePerShare': round(results['value_per_share'], 2),
                'currentPrice': round(results['current_price'], 2),
                'premiumDiscount': round(results['premium_discount'] * 100, 2),
                'enterpriseValue': round(results['enterprise_value'] / 1e9, 2),
                'equityValue': round(results['equity_value'] / 1e9, 2),
                'wacc': round(results['wacc'] * 100, 2),
                'cash': round(results['cash'] / 1e9, 2),
                'debt': round(results['debt'] / 1e9, 2),
                'sharesOutstanding': round(results['shares_outstanding'] / 1e9, 2)
            },
            'recommendation': dcf._get_investment_recommendation(),
            'assumptions': {
                'wacc': round(dcf.wacc * 100, 2),
                'perpetualGrowth': round(perpetual_growth * 100, 2),
                'forecastPeriod': dcf.forecast_period
            }
        }

        # 添加预测数据
        if hasattr(dcf, 'forecast_df'):
            forecast_data = []
            for i, (idx, row) in enumerate(dcf.forecast_df.iterrows()):
                forecast_data.append({
                    'year': f'第{i+1}年',
                    'revenue': round(row['Revenue'] / 1e9, 2),
                    'fcf': round(row['FCF'] / 1e9, 2),
                    'revenueGrowth': round(row['Revenue_Growth'] * 100, 2),
                    'fcfMargin': round(row['FCF_Margin'] * 100, 2)
                })
            response_data['forecast'] = forecast_data

        # 添加敏感性分析数据
        if hasattr(dcf, 'sensitivity_matrix'):
            sensitivity_data = {
                'rows': list(dcf.sensitivity_matrix.index),
                'columns': list(dcf.sensitivity_matrix.columns),
                'values': dcf.sensitivity_matrix.values.tolist()
            }
            response_data['sensitivity'] = sensitivity_data

        # 添加WACC详情
        if hasattr(dcf, 'wacc_details'):
            response_data['waccDetails'] = {
                'riskFreeRate': round(dcf.wacc_details['risk_free_rate'] * 100, 2),
                'beta': round(dcf.wacc_details['beta'], 4),
                'marketRiskPremium': round(dcf.wacc_details['market_risk_premium'] * 100, 2),
                'costOfEquity': round(dcf.wacc_details['cost_of_equity'] * 100, 2),
                'costOfDebt': round(dcf.wacc_details['cost_of_debt'] * 100, 2),
                'weightEquity': round(dcf.wacc_details['weight_equity'] * 100, 2),
                'weightDebt': round(dcf.wacc_details['weight_debt'] * 100, 2),
                'taxRate': round(dcf.wacc_details['tax_rate'] * 100, 2)
            }

        return jsonify(response_data)

    except Exception as e:
        return jsonify({'success': False, 'error': f'计算错误: {str(e)}'})

@app.route('/api/export_excel', methods=['POST'])
def export_excel():
    """导出Excel文件"""
    try:
        data = request.json
        ticker = data.get('ticker', '').strip().upper()
        perpetual_growth = float(data.get('perpetualGrowth', 0.025))
        custom_growth_rates = data.get('customGrowthRates')

        # 处理自定义增长率
        growth_rates = None
        if custom_growth_rates:
            growth_rates = [float(x) for x in custom_growth_rates]

        # 创建DCF估值模型
        dcf = DCFValuation(
            ticker=ticker,
            perpetual_growth_rate=perpetual_growth
        )

        # 执行估值
        results = dcf.comprehensive_valuation(growth_rates)

        if not results:
            return jsonify({'success': False, 'error': '估值计算失败'})

        # 生成Excel文件
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{ticker}_DCF_valuation_{timestamp}.xlsx"
        filepath = os.path.join(os.path.dirname(__file__), filename)

        dcf.export_to_excel(filepath)

        return jsonify({
            'success': True,
            'filename': filename,
            'message': 'Excel文件已生成'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'导出失败: {str(e)}'})

@app.route('/api/download/<filename>')
def download_file(filename):
    """下载生成的Excel文件"""
    try:
        filepath = os.path.join(os.path.dirname(__file__), filename)
        return send_file(filepath, as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'下载失败: {str(e)}'})

if __name__ == '__main__':
    # 创建templates和static目录
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)

    # 从环境变量获取端口（Railway会设置PORT环境变量）
    port = int(os.environ.get('PORT', 5000))

    print("=" * 60)
    print("DCF估值模型 Web服务器")
    print("=" * 60)
    print(f"服务器启动在: http://0.0.0.0:{port}")
    print("按 Ctrl+C 停止服务器")
    print("=" * 60)

    app.run(debug=False, host='0.0.0.0', port=port)
