# 可插拔存储提供商系统 (Pluggable Storage Provider System)

MatrixGen Pro 支持在 Supabase 和 Aliyun OSS 之间无缝切换存储提供商，通过简单的环境变量配置即可实现。

## 🌟 特性

- **统一接口**: 前端和后端使用相同的抽象接口
- **零代码修改**: 只需更改环境变量即可切换提供商
- **自动发布**: 发布脚本自动上传到配置的存储提供商
- **兼容性**: 支持角色视频、图像和发布文件的上传

## 📋 配置步骤

### 1. 选择存储提供商

在 `.env` 文件中设置提供商：

```bash
# 开发/免费环境 (默认)
VITE_STORAGE_PROVIDER=supabase

# 生产/高可用环境
VITE_STORAGE_PROVIDER=aliyun
```

### 2. 配置 Supabase (推荐用于开发)

1. 访问 [Supabase](https://supabase.com) 创建免费账户
2. 创建新项目
3. 在项目设置中获取以下信息：

```bash
# 前端使用 (公开密钥)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_KEY=your-anon-key

# 发布脚本使用 (服务密钥，保密)
SUPABASE_SERVICE_KEY=your-service-role-key
```

4. 在 Supabase 中创建存储桶：
   - 名称: `JU-supabase` (与现有代码兼容)
   - 权限: 公开读取

### 3. 配置 Aliyun OSS (推荐用于生产)

1. 访问 [阿里云 OSS](https://oss.console.aliyun.com) 创建存储桶
2. 获取 AccessKey：

```bash
VITE_ALIYUN_OSS_REGION=oss-cn-hangzhou
VITE_ALIYUN_OSS_BUCKET=your-bucket-name
VITE_ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
VITE_ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

## 🚀 使用方法

### 前端使用 (自动)

角色创建时会自动使用配置的存储提供商：

```typescript
import { StorageService } from '../services/StorageService';

// 上传角色视频
const videoUrl = await StorageService.uploadFile(videoFile, 'videos');

// 上传角色图片
const imageUrl = await StorageService.uploadFile(imageFile, 'characters');
```

### 发布脚本 (自动)

运行发布脚本时会自动上传安装包：

```bash
# 这会构建、提交并自动上传到配置的存储提供商
.\release_new_version.ps1 0.1.36
```

脚本会输出可用于 Gitee latest.json 的 URL：

```
✅ Upload Success!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 COPY THIS URL TO GITEE LATEST.JSON 🎉

https://your-storage-url/MatrixGen_v0.1.36.zip

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 File uploaded to SUPABASE successfully!
```

## 📁 文件夹结构

不同类型的文件会上传到对应的文件夹：

- `videos/`: 角色视频文件
- `characters/`: 角色图片文件
- `release-files/`: 发布安装包

## 🔧 故障排除

### Supabase 上传失败

1. 检查 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_KEY` 是否正确
2. 确认存储桶 `JU-supabase` 存在且有公开读取权限
3. 检查网络连接

### Aliyun OSS 上传失败

1. 确认 AccessKey 有 OSS 写入权限
2. 检查存储桶名称和区域是否正确
3. 确认 `ali-oss` 包已安装：`npm install`

### 发布脚本失败

1. 确保 `.env` 文件存在且包含正确的配置
2. 检查 Node.js 和 npm 已安装
3. 确认发布脚本有存储桶写入权限

## 🔒 安全性

- 前端使用只读密钥 (anon-key)
- 发布脚本使用服务密钥 (service-role-key)，请妥善保管
- 不要将 `.env` 文件提交到版本控制系统
- Aliyun AccessKey Secret 应定期轮换

## 📊 性能对比

| 特性 | Supabase | Aliyun OSS |
|------|----------|------------|
| 免费额度 | 500MB/月 | 按量付费 |
| 全球 CDN | ✅ | ✅ |
| API 限制 | 有 | 无 |
| 扩展性 | 中等 | 优秀 |
| 推荐场景 | 开发/小规模 | 生产/大规模 |

## 🆘 支持

如果遇到问题，请检查：

1. 环境变量配置是否正确
2. 网络连接是否正常
3. 存储服务权限设置
4. 浏览器控制台错误信息

如需技术支持，请联系开发者。