# mas-react

一个基于 React + TypeScript + Vite 构建的现代化前端项目。

## ✨ 特性

- ⚡️ **快速开发** - 使用 Vite 作为构建工具，提供极速的开发体验
- 🔒 **类型安全** - 使用 TypeScript 确保代码的类型安全
- 🎯 **路由管理** - 使用 React Router v6 进行路由管理
- 📦 **状态管理** - 内置状态管理方案
- 🌐 **HTTP 请求** - 集成 Axios 进行网络请求
- 💅 **样式方案** - 支持 Less 预处理器和 CSS Modules

## 🛠️ 技术栈

- **框架**: React 18.2
- **语言**: TypeScript 5.0
- **构建工具**: Vite 4.3
- **路由**: React Router 6.11
- **HTTP 客户端**: Axios 1.4
- **样式预处理**: Less 4.1
- **代码规范**: ESLint



## 📁 项目结构

```
mas-react/
├── src/
│   ├── assets/          # 静态资源
│   ├── components/      # 公共组件
│   ├── http/            # HTTP 请求配置
│   ├── layout/          # 布局组件
│   ├── router/          # 路由配置
│   ├── store/           # 状态管理
│   ├── utils/           # 工具函数
│   ├── views/           # 页面组件
│   ├── global.less      # 全局样式
│   ├── theme.less       # 主题配置
│   └── main.tsx         # 入口文件
├── index.html           # HTML 模板
├── vite.config.ts       # Vite 配置
├── tsconfig.json        # TypeScript 配置
└── package.json         # 项目配置
```

## 🔧 配置说明

### 路径别名

项目配置了路径别名 `@` 指向 `src` 目录，可以在导入时使用：

```typescript
import Layout from "@/layout/Layout";
import { router } from "@/router";
```

### 环境变量

- `NODE_ENV=development` - 开发环境
- `NODE_ENV=production` - 生产环境

## 📝 开发规范

- 使用 TypeScript 进行类型定义
- 函数和类型注释使用 JSDoc 格式
- 遵循 ESLint 代码规范
- 组件样式优先使用 CSS Modules
- 安装尽量使用cnpm

## 📄 License

MIT
