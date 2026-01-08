import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================= 配置区 =================
// 1. 填入你的私钥 (原封不动填进去)
const MY_PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5STFkNkpOa0xsbW42T3hIVHZBOVhnNDkwY2tHaHpld2dGSzhYT3lidzJac0FBQkFBQUFBQUFBQUFBQUlBQUFBQUQ1UWFkT1dFSVI1eEM5b05ZWjlWcVMvcXFVVmdITVhXbVk2TlFFVWo4Yjh5YUJNZG5BejFsVmQrT0JneGNyVVAwRFVZSG4welhPYTRHK0FYZ20wTmNVK2tReVdRV25PRWlBL1dGa2UzcVFDR3hJRjZrVDM2djJFRS81ZWtmclR1SlFLUlA2dEU1WVU9Cg==";

// 2. 填入你的公钥
const MY_PUBLIC_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEUxNDQyOUZERjQ2MzY4RTYKUldUbWFHUDAvU2xFNFJNUjRyaDBZQVdJMXNVbFI5d3lFR250d1hGc0pwdkJOZjZDb3JPQW8vTnkK";

// 3. 填入你的简单密码
const MY_PASSWORD = "12345"; 
// ==========================================

const VERSION = "0.1.0"; 
const GITHUB_USER = "JiGuangX"; 
const REPO_NAME = "matrix-gen-pro"; 
const EXE_NAME = `MatrixGen Pro_${VERSION}_x64-setup.exe`;
const EXE_PATH = path.resolve(__dirname, `src-tauri/target/release/bundle/nsis/${EXE_NAME}`);
const CONFIG_PATH = path.resolve(__dirname, 'src-tauri/tauri.conf.json');
const TEMP_KEY_PATH = path.resolve(__dirname, 'temp_key.txt'); // 临时密钥文件

console.log('🚀 启动最终文件代理签名流水线...');

if (!fs.existsSync(EXE_PATH)) {
    console.error(`❌ 找不到文件: \n${EXE_PATH}`);
    process.exit(1);
}

// 1. 同步公钥
try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    config.plugins.updater.pubkey = MY_PUBLIC_KEY;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('✅ 公钥已同步');
} catch (e) {
    console.error('❌ 配置同步失败:', e.message);
}

// 2. 创建临时密钥文件 (绕过环境变量换行符 Bug)
console.log('>> 步骤 2: 创建临时密钥文件...');
fs.writeFileSync(TEMP_KEY_PATH, MY_PRIVATE_KEY, 'utf-8');

// 3. 执行签名
console.log('>> 步骤 3: 正在读取临时文件进行签名...');
// 注意：这里使用 -k 参数指向临时文件
const sign = spawnSync('npx', ['tauri', 'signer', 'sign', '-k', TEMP_KEY_PATH, `"${EXE_PATH}"`], {
    env: { 
        ...process.env, 
        // 密码没有换行符，可以通过环境变量安全传递
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: MY_PASSWORD 
    },
    encoding: 'utf-8',
    shell: true
});

// 4. 立即删除临时文件 (清理现场)
try {
    fs.unlinkSync(TEMP_KEY_PATH);
    console.log('🧹 临时密钥文件已清理');
} catch (e) {
    console.error('⚠️ 清理临时文件失败，请手动删除 temp_key.txt');
}

const signOutput = sign.stdout + sign.stderr;
const signatureMatch = signOutput.match(/Signature: (.*)/);

if (!signatureMatch) {
    console.error('❌ 签名失败！日志如下：\n', signOutput);
    process.exit(1);
}

const signature = signatureMatch[1].trim();
console.log('✅ 签名获取成功！');

// 5. 生成 JSON
console.log('\n' + '='.repeat(50));
console.log('🎉 请复制以下内容到 latest.json：\n');

const latestJson = {
  version: VERSION,
  notes: `${VERSION} 正式版`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: signature,
      url: `https://ghproxy.net/https://github.com/${GITHUB_USER}/${REPO_NAME}/releases/latest/download/${EXE_NAME.replace(/ /g, '%20')}`
    }
  }
};

console.log(JSON.stringify(latestJson, null, 2));