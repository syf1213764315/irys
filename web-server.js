const express = require('express');
const path = require('path');
const crypto = require("crypto");
const fetch = require("node-fetch");
const { HttpsProxyAgent } = require("https-proxy-agent");

const app = express();
const PORT = 3000;

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 存储运行状态
let isRunning = false;
let currentTask = null;
let logs = [];

// 哈希构造函数
function makeAntiCheatString(e, wpm, accuracy, time, correct, incorrect) {
  const l = correct + incorrect;
  let n = 0 + 23 * wpm + 89 * accuracy + 41 * time + 67 * correct + 13 * incorrect + 97 * l;
  let o = 0;
  for (let i = 0; i < e.length; i++) {
    o += e.charCodeAt(i) * (i + 1);
  }
  n += 31 * o;
  const c = Math.floor(0x178ba57548d * n % Number.MAX_SAFE_INTEGER);
  return `${e.toLowerCase()}_${wpm}_${accuracy}_${time}_${correct}_${incorrect}_${c}`;
}

// 生成 antiCheatHash - 使用SHA256并取前32位
function hashAntiCheat(str) {
  return crypto.createHash("sha256").update(str).digest("hex").substring(0, 32);
}

// 拟人化的游戏数据生成器
function genHumanLikeStats() {
  const correct = Math.floor(Math.random() * 21) + 40; // 40-60
  const incorrect = Math.floor(Math.random() * 4); // 0-3
  const time = 15;
  const total = correct + incorrect;
  const accuracy = Math.round(correct / total * 100);
  const wpm = Math.floor(correct / 5 / time * 60);
  return { wpm, accuracy, time, correctChars: correct, incorrectChars: incorrect };
}

// 睡眠函数
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 添加日志
function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  logs.push({ timestamp, message, type });
  if (logs.length > 1000) {
    logs = logs.slice(-1000); // 保持最多1000条日志
  }
}

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 开始执行任务
app.post('/api/start', async (req, res) => {
  if (isRunning) {
    return res.status(400).json({ error: '任务正在运行中' });
  }

  const { wallets, proxies, requestCount } = req.body;

  if (!wallets || wallets.length === 0) {
    return res.status(400).json({ error: '请至少添加一个钱包地址' });
  }

  if (wallets.length > 10) {
    return res.status(400).json({ error: '最多支持10个账号' });
  }

  if (!requestCount || requestCount < 1) {
    return res.status(400).json({ error: '请设置有效的请求次数' });
  }

  isRunning = true;
  logs = []; // 清空日志
  addLog(`🎯 开始执行任务，账号数量: ${wallets.length}, 请求次数: ${requestCount}`, 'success');

  // 异步执行任务
  currentTask = executeTask(wallets, proxies, requestCount);

  res.json({ success: true, message: '任务已开始' });
});

// 停止任务
app.post('/api/stop', (req, res) => {
  if (!isRunning) {
    return res.status(400).json({ error: '没有正在运行的任务' });
  }

  isRunning = false;
  addLog('🛑 任务已停止', 'warning');
  res.json({ success: true, message: '任务已停止' });
});

// 获取状态
app.get('/api/status', (req, res) => {
  res.json({ 
    isRunning, 
    logs: logs.slice(-50) // 返回最近50条日志
  });
});

// 执行任务的主函数
async function executeTask(wallets, proxies, requestCount) {
  try {
    // 处理代理
    let proxyList = [];
    if (proxies && proxies.length > 0) {
      proxyList = proxies.filter(proxy => proxy.trim() && proxy.startsWith('http'));
      addLog(`✅ 使用 ${proxyList.length} 个代理`);
    } else {
      addLog('ℹ️ 使用本地代理');
    }

    // 为每个账号创建独立的运行函数
    const accountTasks = wallets.map((wallet, walletIndex) => {
      return async () => {
        addLog(`💰 账号 ${walletIndex + 1}/${wallets.length} 开始运行: ${wallet.substring(0, 10)}...`, 'info');
        
        for (let i = 0; i < requestCount; i++) {
          if (!isRunning) {
            addLog(`🛑 账号 ${walletIndex + 1} 任务被中断`, 'warning');
            return;
          }

          const stats = genHumanLikeStats();
          const hashInput = makeAntiCheatString(wallet, stats.wpm, stats.accuracy, stats.time, stats.correctChars, stats.incorrectChars);
          const antiCheatHash = hashAntiCheat(hashInput);
          const timestamp = Date.now();

          const payload = {
            walletAddress: wallet,
            gameStats: {
              wpm: stats.wpm,
              accuracy: stats.accuracy,
              time: stats.time,
              correctChars: stats.correctChars,
              incorrectChars: stats.incorrectChars,
              progressData: []
            },
            antiCheatHash,
            timestamp
          };

          // 选择代理
          let agent = null;
          if (proxyList.length > 0) {
            const proxy = proxyList[(walletIndex * requestCount + i) % proxyList.length];
            agent = new HttpsProxyAgent(proxy);
            addLog(`[账号${walletIndex + 1}] [${i+1}/${requestCount}] 🔗 使用代理: ${proxy.split('@')[1] || proxy}`, 'info');
          } else {
            addLog(`[账号${walletIndex + 1}] [${i+1}/${requestCount}] 📤 发送请求...`, 'info');
          }

          try {
            const res = await fetch("https://spritetype.irys.xyz/api/submit-result", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Referer": "https://spritetype.irys.xyz/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              },
              body: JSON.stringify(payload),
              agent: agent,
              timeout: 30000
            });

            const data = await res.json();
            if (res.ok && data.success) {
              addLog(`[账号${walletIndex + 1}] ✅ 成功`, 'success');
            } else {
              addLog(`[账号${walletIndex + 1}] ❌ 服务器错误: ${JSON.stringify(data)}`, 'error');
            }
          } catch (err) {
            addLog(`[账号${walletIndex + 1}] ❌ 网络错误: ${err.message}`, 'error');
          }

          if (i < requestCount - 1 && isRunning) {
            const wait = Math.floor(Math.random() * 21000) + 10000; // 10~31秒
            addLog(`[账号${walletIndex + 1}] ⏳ 等待${(wait/1000).toFixed(1)}秒...`, 'info');
            await sleep(wait);
          }
        }
        
        addLog(`🎉 账号 ${walletIndex + 1} 完成${requestCount}次请求！`, 'success');
      };
    });

    // 同时运行所有账号
    addLog(`🚀 开始并发运行 ${wallets.length} 个账号...`, 'info');
    await Promise.all(accountTasks.map(task => task()));
    
    addLog(`🎉 所有账号完成！总计执行 ${wallets.length * requestCount} 次请求`, 'success');
  } catch (error) {
    addLog(`❌ 任务执行出错: ${error.message}`, 'error');
  } finally {
    isRunning = false;
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Web服务器已启动: http://localhost:${PORT}`);
}); 