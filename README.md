# 君正杯评分系统

本目录导出后是独立应用源码，不需要主站仓库。页面风格采用主站暖白和青绿色配色；评委继续使用原 API Key 登录。

## 发布

将完整导出目录放入名为 `competition-scoring` 的公开 GitHub/Gitee 仓库，在主站登记仓库 URL 和发布分支。平台自动构建根目录的 Dockerfile；发布分支的新提交自动上线。

若仓库名称不同，在主站登记时将可选应用标识设为 `competition-scoring`，与 `app.json` 一致。

回退代码可以在自己的仓库提交 `git revert` 变更，平台会自动检测并发布。平台管理员也可直接选择仍保留的兼容历史构建版本。

## 配置和数据

由平台注入 `DATABASE_URL`、`COMPETITION_CONFIG_FILE`、`COMPETITION_TOKEN_SECRET`、`COMPETITION_IDENTITY_URL` 和 `COMPETITION_IDENTITY_BRIDGE_TOKEN`。真实配置不得提交到公开仓库。

数据库必须是平台的 `website_business`，使用专用账号访问 `competition` schema；生产环境没有 SQLite 回退。业务文件写入 `/app-data`，应用根目录只读。

`data_contract` 表示数据结构兼容范围。保留相同契约的版本必须兼容现有评分数据及可回退版本；破坏性迁移需要先和平台维护人员安排，不能混入普通自动发布。

## 本地前端开发

```bash
cd frontend
npm ci
npm run dev
```

后端需要连接平台提供的隔离开发环境和测试身份服务。生产比赛配置及数据不随源码分发。
