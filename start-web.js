const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 启动 Irys 任务管理器 Web 界面...');
console.log('📁 当前目录:', __dirname);

// 启动 web-server.js
const server = spawn('node', ['web-server.js'], {
    stdio: 'inherit',
    cwd: __dirname
});

server.on('error', (error) => {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
});

server.on('close', (code) => {
    console.log(`\n🛑 服务器已关闭，退出码: ${code}`);
    process.exit(code);
});

// 处理进程退出
process.on('SIGINT', () => {
    console.log('\n🛑 收到中断信号，正在关闭服务器...');
    server.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在关闭服务器...');
    server.kill('SIGTERM');
}); 