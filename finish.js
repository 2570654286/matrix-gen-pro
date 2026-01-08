import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ESM 环境下获取 __dirname 的标准写法
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ==========================================
// 1. 你的私钥 (已硬编码，无需修改)
const PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5STFkNkpOa0xsbW42T3hIVHZBOVhnNDkwY2tHaHpld2dGSzhYT3lidzJac0FBQkFBQUFBQUFBQUFBQUlBQUFBQUQ1UWFkT1dFSVI1eEM5b05ZWjlWcVMvcXFVVmdITVhXbVk2TlFFVWo4Yjh5YUJNZG5BejFsVmQrT0JneGNyVVAwRFVZSG4welhPYTRHK0FYZ20wTmNVK2tReVdRV25PRWlBL1dGa2UzcVFDR3hJRjZrVDM2djJFRS81ZWtmclR1SlFLUlA2dEU1WVU9Cg==";

// 2. 你的密码
const PASSWORD = "12345";

// 3. 目标文件 (确保 setup.exe 就在当前目录下)
const EXE_NAME = "setup.exe";
// ==========================================

console.log("🚀 启动 ESM 签名脚本：直接调用 Tauri 内核...");

// 检查文件
const exePath = path.join(__dirname, EXE_NAME);
if (!fs.existsSync(exePath)) {
    console.error(`❌ 找不到文件: ${EXE_NAME}`);
    console.error("   请把生成的安装包复制到当前目录并重命名为 setup.exe");
    process.exit(1);
}

// 核心逻辑：直接寻找 node_modules 里的 tauri 可执行脚本
// 这样可以完全绕过 Windows CMD/PowerShell 的环境变量截断问题
let tauriCliPath;
try {
    // 尝试解析本地安装的 @tauri-apps/cli
    tauriCliPath = path.resolve(__dirname, 'node_modules', '@tauri-apps', 'cli', 'bin', 'tauri.js');
    if (!fs.existsSync(tauriCliPath)) {
        throw new Error("Local path not found");
    }
} catch (e) {
    console.error("❌ 找不到本地 Tauri CLI，请确认 node_modules 完整。");
    process.exit(1);
}

// 构造纯净的环境变量
const env = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: PRIVATE_KEY,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: PASSWORD
};

console.log(`>> 调用核心: ${tauriCliPath}`);

// 使用 Node 直接启动 JS 脚本，不通过 Shell
const child = spawn(process.execPath, [tauriCliPath, 'signer', 'sign', EXE_NAME], {
    env: env,
    cwd: __dirname,
    stdio: 'inherit' // 直接显示输出
});

child.on('close', (code) => {
    if (code === 0) {
        console.log("\n✅ === 签名成功！请复制上面的 Signature 填入 latest.json ===\n");
    } else {
        console.log(`\n❌ 进程退出，错误码: ${code}`);
    }
});