import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 支持 ES modules 的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const provider = process.env.STORAGE_PROVIDER || process.env.VITE_STORAGE_PROVIDER || 'supabase';
const filePath = process.argv[2];
const version = process.argv[3];

if (!filePath || !version) {
  console.error("Usage: node scripts/publish-release.mjs <path-to-zip> <version>");
  console.error("Example: node scripts/publish-release.mjs ./src-tauri/target/release/bundle/nsis/MatrixGen.Pro_0.1.36_x64-setup.nsis.zip 0.1.36");
  process.exit(1);
}

// 检查文件是否存在
if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

async function uploadToSupabase() {
  console.log('📤 Uploading to Supabase...');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing. Please check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const fileName = `MatrixGen_v${version}.zip`;
  const fileContent = fs.readFileSync(filePath);

  // 上传文件 (使用现有的 JU-supabase bucket)
  const { error } = await supabase.storage
    .from('JU-supabase')
    .upload(`releases/${fileName}`, fileContent, { upsert: true });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  // 获取公开 URL
  const { data } = supabase.storage
    .from('JU-supabase')
    .getPublicUrl(`releases/${fileName}`);

  if (!data.publicUrl) {
    throw new Error('Failed to get public URL from Supabase');
  }

  return data.publicUrl;
}

async function uploadToAliyunOSS() {
  console.log('📤 Uploading to Aliyun OSS...');

  const region = process.env.ALIYUN_OSS_REGION || process.env.VITE_ALIYUN_OSS_REGION || 'oss-cn-hangzhou';
  const bucket = process.env.ALIYUN_OSS_BUCKET || process.env.VITE_ALIYUN_OSS_BUCKET;
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID || process.env.VITE_ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || process.env.VITE_ALIYUN_OSS_ACCESS_KEY_SECRET;

  if (!bucket || !accessKeyId || !accessKeySecret) {
    throw new Error('Aliyun OSS configuration missing. Please check ALIYUN_OSS_* variables in .env');
  }

  try {
    // 动态导入 ali-oss
    const OSS = (await import('ali-oss')).default;

    const client = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket
    });

    const fileName = `release-files/MatrixGen_v${version}.zip`;

    console.log(`Uploading ${fileName} to Aliyun OSS...`);

    const result = await client.put(fileName, filePath);

    if (!result.res?.requestUrls?.[0]) {
      throw new Error('Failed to get upload URL from Aliyun OSS');
    }

    return result.res.requestUrls[0];
  } catch (importError) {
    console.error('Aliyun OSS SDK not installed. Please run: npm install ali-oss');
    throw new Error('Aliyun OSS SDK not available. Please install ali-oss package.');
  }
}

async function run() {
  console.log(`🚀 Publishing MatrixGen Pro v${version} to [${provider}]...`);
  console.log(`📁 File: ${filePath}`);

  try {
    let publicUrl = "";

    if (provider === 'supabase') {
      publicUrl = await uploadToSupabase();
    } else if (provider === 'aliyun') {
      publicUrl = await uploadToAliyunOSS();
    } else {
      throw new Error(`Unsupported storage provider: ${provider}`);
    }

    console.log("\n✅ Upload Success!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 COPY THIS URL TO GITEE LATEST.JSON 🎉");
    console.log("");
    console.log(publicUrl);
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📦 File uploaded to ${provider.toUpperCase()} successfully!`);

  } catch (error) {
    console.error("\n❌ Upload Failed!");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

run();