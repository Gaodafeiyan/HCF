import express from 'express';
import path from 'path';

const adminRouter = express.Router();

// 获取正确的路径 - 使用相对于backend目录的路径
const publicPath = path.join(__dirname, '..', 'admin', 'public');

// 静态文件服务
adminRouter.use('/static', express.static(path.join(publicPath, 'static')));

// 登录页面
adminRouter.get('/login', (req, res) => {
  const loginPath = path.join(publicPath, 'login.html');
  console.log('Serving login page from:', loginPath);
  res.sendFile(loginPath);
});

// 后台管理主页 (默认)
adminRouter.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  console.log('Serving admin page from:', indexPath);
  res.sendFile(indexPath);
});

// 增强版后台管理页面
adminRouter.get('/index-enhanced', (req, res) => {
  const enhancedPath = path.join(publicPath, 'index-enhanced.html');
  console.log('Serving enhanced admin page from:', enhancedPath);
  res.sendFile(enhancedPath);
});

// 兼容性路由 - 直接访问HTML文件
adminRouter.get('/:page.html', (req, res) => {
  const pageName = req.params.page;
  const pagePath = path.join(publicPath, `${pageName}.html`);
  console.log(`Serving ${pageName}.html from:`, pagePath);
  res.sendFile(pagePath);
});

export default adminRouter;
