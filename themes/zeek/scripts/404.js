/* 404 页生成器：产出 public/404.html（GitHub Pages 对不存在的路径直接服务此文件） */
hexo.extend.generator.register('page404', function () {
  return {
    path: '404.html',
    layout: ['404', 'page', 'index'],
    data: { title: '页面走丢了' }
  };
});
