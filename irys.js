const crypto = require("crypto");
const fetch = require("node-fetch");
const fs = require("fs");
const { HttpsProxyAgent } = require("https-proxy-agent");

// 钱包地址列表
const wallets = [
  // "0xfd221b7353a2848f66d88eef675f9bd8301fbead",
  // "0xa01cc30678d71b504677acd0ca8d9b740f30db59",
  // "0x7e90a451213df04f603486bd480f4a8646369ebf",
  // "0xcbf97a522361e52fa48d557de759c95f9c3adacd",
  // "0x623d2f839f377fd77d25f47676c75dc0b5c40846",
  // "0x1aba04f7eaf807c9d7f3d57d8671cb740b1de73b",
  "0x0710efda40fb04d759d0f4e7a483618459e117b9",
  // 可以在这里添加更多钱包地址（最多10个）
];

// 读取代理列表
function readProxies() {
  try {
    const content = fs.readFileSync("proxies.txt", "utf8");
    const proxies = content.split("\n")
      .filter(line => line.trim() && line.startsWith("http"))
      .map(line => line.trim());
    
    console.log(`✅ 成功读取 ${proxies.length} 个代理`);
    return proxies;
  } catch (error) {
    console.error("❌ 读取代理文件失败:", error.message);
    return [];
  }
}

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

async function main() {
  // 验证账号数量
  if (wallets.length > 10) {
    console.error("❌ 最多支持10个账号，当前有", wallets.length, "个账号");
    return;
  }
  
  if (wallets.length === 0) {
    console.error("❌ 请至少添加一个钱包地址");
    return;
  }

  // 读取代理
  const proxies = readProxies();
  if (proxies.length === 0) {
    console.error("❌ 没有可用的代理，程序退出");
    return;
  }

  console.log(`🎯 开始执行，账号数量: ${wallets.length}, 代理数量: ${proxies.length}`);
  console.log(`📊 每个账号将执行 150 次请求，总计 ${wallets.length * 150} 次`);
  
  // 为每个账号创建独立的运行函数
  const accountTasks = wallets.map((wallet, walletIndex) => {
    return async () => {
      console.log(`\n💰 账号 ${walletIndex + 1}/${wallets.length} 开始运行: ${wallet}`);
      
      for (let i = 0; i < 150; i++) {
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

        // 轮换使用代理
        const proxy = proxies[(walletIndex * 150 + i) % proxies.length];
        const agent = new HttpsProxyAgent(proxy);

        console.log(`[账号${walletIndex + 1}] [${i+1}/150] 📤 ${wallet.substring(0, 10)}...`);
        console.log(`[账号${walletIndex + 1}] 🔗 代理: ${proxy.split('@')[1]}`);

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
            console.log(`[账号${walletIndex + 1}] ✅ Success`, data);
          } else {
            console.log(`[账号${walletIndex + 1}] ❌ Server Error:`, data);
          }
        } catch (err) {
          console.log(`[账号${walletIndex + 1}] ❌ 网络错误:`, err.message);
        }

        if (i < 149) {
          const wait = Math.floor(Math.random() * 21000) + 10000; // 10~31秒
          console.log(`[账号${walletIndex + 1}] ⏳ 等待${(wait/1000).toFixed(1)}秒...`);
          await sleep(wait);
        }
      }
      
      console.log(`\n🎉 账号 ${walletIndex + 1} 完成150次请求！`);
    };
  });

  // 同时运行所有账号
  console.log(`\n🚀 开始并发运行 ${wallets.length} 个账号...`);
  await Promise.all(accountTasks.map(task => task()));
  
  console.log(`\n🎉 所有账号完成！总计执行 ${wallets.length * 150} 次请求`);
}

main();
