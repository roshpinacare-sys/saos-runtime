import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, 'state');
const LOG_FILE = join(STATE_DIR, 'rate-control-monitor.log');
const ALERT_THRESHOLD_RESPONSE_TIME = 2000; // 2 seconds
const ALERT_THRESHOLD_FAILURE_RATE = 0.15; // 15%
const HISTORY_SIZE = 100; // Keep last 100 measurements

class RateControlMonitor {
  constructor() {
    this.metrics = {
      responseTimes: [],
      successRates: [],
      alerts: [],
      lastReportDate: null
    };
    this.failClosedNodes = [];
    this.initialize();
  }

  async initialize() {
    try {
      // Load fail-closed nodes
      const failClosedFiles = [
        'fabric/cmvpf13t/fail-closed-preserved-saos-runtime.js',
        'fabric/cmvpfdyd/fail-closed-preserved-saos-runtime.js',
        'fabric/cmvpgtg0/fail-closed.js',
        'fabric/cmvpl1zg/fail-closed.js'
      ];
      
      for (const file of failClosedFiles) {
        try {
          const content = await readFile(file, 'utf-8');
          this.failClosedNodes.push({
            name: file.split('/').pop(),
            contentHash: createHash('sha256').update(content).digest('hex'),
            lastChecked: new Date().toISOString()
          });
        } catch (err) {
          console.warn(`Could not read file ${file}: ${err.message}`);
        }
      }
      
      console.log(`Initialized with ${this.failClosedNodes.length} fail-closed nodes`);
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  async collectMetrics() {
    const timestamp = new Date().toISOString();
    const metrics = {
      timestamp,
      responseTimes: [],
      successCount: 0,
      failureCount: 0,
      totalRequests: 0
    };

    // Simulate collecting metrics from fail-closed nodes
    for (const node of this.failClosedNodes) {
      // Simulate response time between 0.5s to 3s
      const responseTime = 500 + Math.random() * 2500;
      metrics.responseTimes.push(responseTime);
      
      // Simulate success/failure
      const isSuccess = Math.random() > 0.1; // 90% success rate
      if (isSuccess) {
        metrics.successCount++;
      } else {
        metrics.failureCount++;
      }
      metrics.totalRequests++;
    }

    // Calculate average response time
    const avgResponseTime = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
    
    // Calculate success rate
    const successRate = metrics.totalRequests > 0 
      ? metrics.successCount / metrics.totalRequests 
      : 1;
    
    // Store metrics
    this.metrics.responseTimes.push({
      timestamp,
      value: avgResponseTime
    });
    
    this.metrics.successRates.push({
      timestamp,
      value: successRate
    });
    
    // Keep only recent history
    if (this.metrics.responseTimes.length > HISTORY_SIZE) {
      this.metrics.responseTimes.shift();
    }
    
    if (this.metrics.successRates.length > HISTORY_SIZE) {
      this.metrics.successRates.shift();
    }
    
    // Check for alerts
    this.checkAlerts(avgResponseTime, successRate, timestamp);
    
    return {
      avgResponseTime,
      successRate,
      totalRequests: metrics.totalRequests,
      successCount: metrics.successCount,
      failureCount: metrics.failureCount
    };
  }

  checkAlerts(responseTime, successRate, timestamp) {
    const alerts = [];
    
    if (responseTime > ALERT_THRESHOLD_RESPONSE_TIME) {
      alerts.push({
        type: 'HIGH_RESPONSE_TIME',
        message: `High response time: ${responseTime.toFixed(2)}ms (threshold: ${ALERT_THRESHOLD_RESPONSE_TIME}ms)`,
        timestamp,
        severity: 'high'
      });
    }
    
    if (successRate < (1 - ALERT_THRESHOLD_FAILURE_RATE)) {
      alerts.push({
        type: 'HIGH_FAILURE_RATE',
        message: `High failure rate: ${(1 - successRate * 100).toFixed(2)}% (threshold: ${(ALERT_THRESHOLD_FAILURE_RATE * 100).toFixed(2)}%)`,
        timestamp,
        severity: 'high'
      });
    }
    
    // Check for trends
    const trend = this.analyzeTrends();
    if (trend.responseTrend === 'increasing' && trend.responseSlope > 0.5) {
      alerts.push({
        type: 'RESPONSE_TIME_TREND',
        message: 'Response time is increasing rapidly',
        timestamp,
        severity: 'medium'
      });
    }
    
    if (trend.successTrend === 'decreasing' && trend.successSlope < -0.1) {
      alerts.push({
        type: 'SUCCESS_RATE_TREND',
        message: 'Success rate is decreasing',
        timestamp,
        severity: 'medium'
      });
    }
    
    // Add new alerts
    if (alerts.length > 0) {
      this.metrics.alerts.push(...alerts);
      console.log('ALERT:', alerts.map(a => a.message).join(', '));
    }
    
    return alerts;
  }

  analyzeTrends() {
    const responseTrend = 'stable'; // Default
    const successTrend = 'stable'; // Default
    
    let responseSlope = 0;
    let successSlope = 0;
    
    if (this.metrics.responseTimes.length > 10) {
      const recent = this.metrics.responseTimes.slice(-10);
      responseSlope = this.calculateSlope(recent);
      responseTrend = responseSlope > 0.1 ? 'increasing' : responseSlope < -0.1 ? 'decreasing' : 'stable';
    }
    
    if (this.metrics.successRates.length > 10) {
      const recent = this.metrics.successRates.slice(-10);
      successSlope = this.calculateSlope(recent);
      successTrend = successSlope > 0.1 ? 'improving' : successSlope < -0.1 ? 'declining' : 'stable';
    }
    
    return {
      responseTrend,
      responseSlope,
      successTrend,
      successSlope
    };
  }

  calculateSlope(data) {
    if (data.length < 2) return 0;
    
    const n = data.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = data.reduce((sum, point) => sum + point.value, 0);
    const sumXY = data.reduce((sum, point, i) => sum + (i * point.value), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  generateDailyReport() {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we already generated a report today
    if (this.metrics.lastReportDate === today) {
      return null;
    }
    
    const report = {
      date: today,
      summary: {
        avgResponseTime: 0,
        avgSuccessRate: 0,
        totalAlerts: this.metrics.alerts.length,
        highSeverityAlerts: this.metrics.alerts.filter(a => a.severity === 'high').length
      },
      trends: this.analyzeTrends(),
      recommendations: [],
      alerts: this.metrics.alerts.slice(-10) // Last 10 alerts
    };
    
    // Calculate averages
    if (this.metrics.responseTimes.length > 0) {
      report.summary.avgResponseTime = this.metrics.responseTimes.reduce((sum, point) => sum + point.value, 0) / this.metrics.responseTimes.length;
    }
    
    if (this.metrics.successRates.length > 0) {
      report.summary.avgSuccessRate = this.metrics.successRates.reduce((sum, point) => sum + point.value, 0) / this.metrics.successRates.length;
    }
    
    // Generate recommendations
    if (report.summary.avgResponseTime > ALERT_THRESHOLD_RESPONSE_TIME * 0.8) {
      report.recommendations.push('Consider optimizing fail-closed node performance or scaling resources');
    }
    
    if (report.summary.avgSuccessRate < (1 - ALERT_THRESHOLD_FAILURE_RATE * 0.8)) {
      report.recommendations.push('Investigate failure patterns in fail-closed nodes');
    }
    
    if (report.trends.responseTrend === 'increasing') {
      report.recommendations.push('Response time trend is increasing - monitor closely');
    }
    
    if (report.trends.successTrend === 'declining') {
      report.recommendations.push('Success rate is declining - investigate root causes');
    }
    
    if (report.summary.totalAlerts > 5) {
      report.recommendations.push('High alert volume - consider adjusting thresholds or investigating systemic issues');
    }
    
    // Update last report date
    this.metrics.lastReportDate = today;
    
    return report;
  }
}

// Main execution
const monitor = new RateControlMonitor();

// Set up periodic monitoring
setInterval(async () => {
  try {
    const metrics = await monitor.collectMetrics();
    console.log(`[${new Date().toISOString()}] Metrics - Avg Response: ${metrics.avgResponseTime.toFixed(2)}ms, Success Rate: ${(metrics.successRate * 100).toFixed(2)}%`);
  } catch (err) {
    console.error('Error collecting metrics:', err);
  }
}, 60000); // Run every minute

// Daily report generation
setInterval(async () => {
  try {
    const report = monitor.generateDailyReport();
    if (report) {
      console.log('=== DAILY REPORT ===');
      console.log(`Date: ${report.date}`);
      console.log(`Average Response Time: ${report.summary.avgResponseTime.toFixed(2)}ms`);
      console.log(`Average Success Rate: ${(report.summary.avgSuccessRate * 100).toFixed(2)}%`);
      console.log(`Total Alerts: ${report.summary.totalAlerts}`);
      console.log(`High Severity Alerts: ${report.summary.highSeverityAlerts}`);
      
      if (report.recommendations.length > 0) {
        console.log('\nRecommendations:');
        report.recommendations.forEach(rec => console.log(`- ${rec}`));
      }
      
      console.log('====================\n');
    }
  } catch (err) {
    console.error('Error generating report:', err);
  }
}, 86400000); // Run every 24 hours

console.log('Rate Control Monitor started');
