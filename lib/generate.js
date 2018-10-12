const path = require('path');
const globby = require('globby');
const utils = require('ntils');
const cssnano = require('cssnano');
const Cfg = require('webpackrc-cfg');

const { WebpackConfig } = Cfg;
const { 
  BabelLoader, VueLoader, JsonLoader, RawLoader, EjsLoader, UrlLoader, 
  CssLoader, CssExtractLoader, LessLoader, FastSassLoader 
} = WebpackConfig.loaders;
const { 
  MiniCssExtractPlugin, CommonsChunkPlugin, WebpackVisualizerPlugin, DefinePlugin, 
  OptimizeCssAssetsPlugin, HtmlWebpackPlugin
} = WebpackConfig.plugins;
const { 
  Babel_Preset_Env, Babel_Preset_React, Babel_Preset_Stage_0, 
  Babel_Plugin_Transform_Runtime, Babel_Plugin_Add_Module_Exports, 
  Babel_Plugin_Transform_Remove_Strict_Mode
} = BabelLoader;

const hasOwnProperty = Object.prototype.hasOwnProperty;
const isObject = obj => Object.prototype.toString.call(obj) === "[object Object]";

const defaultOpts = {
  mode: 'development',
  entry: ['./src/*.{js,jsx,ts,tsx}'],
  template: ['./src/assets/*.html'],
  output: './build/',
  chunkFilename: 'chunks/[name]-[chunkhash].js',
  common: {
    name: 'common',
    disabled: false
  },
  folders: {
    js: 'js',
    css: 'css',
    img: 'img',
    font: 'font',
    html: ''
  },
  config: {
    name: '$config',
    path: './src/config'
  },
  inject: [],// 待加载的公共模块
  umd,
  babel: {
    presets: [],
    plugins: [],
    browsers: [
      'last 2 versions',
      'IE >= 9'
    ],
    uglify: true,
    include: [],
    exclude: [],
    loose: true,
    modules: 'commonjs',
    useBuiltIns: 'usage',
    spec: false,
    react: true,
    transform: {
      helpers: true,
      polyfill: true,
      regenerator: true,
      moduleName: 'babel-runtime',
      useBuiltIns: false
    },
    addExports: true,
    strict: false
  },
  loaders: [],
  compress: true,
  sourceMap: 'source-map',
  external: false
};

function mixinDefaultOpts(opts){
  Object.keys(deafultOpts).map(key => {
    if ( hasOwnProperty.call(opts, key) && opts[key] !== 'undefined' ) return;
    
    if ( isObject(opts[key]) ) opts[key] = { ...defaultOpts[key],  ...opts[key] };
    else opts[key] = defaultOpts[key];
  });

  return opts;
}

function getTemplates(opts) {
  let templates;
  if (utils.isObject(opts.template) && !utils.isArray(opts.template)) {
    templates = [];
    utils.each(opts.template, (nameExpr, fileExpr) => {
      let files = globby.sync(fileExpr);
      files.forEach(file => {
        let paths = file.split('/').reverse()
          .map(item => (path.basename(item).split('.')[0]));
        let name = nameExpr.replace(/\((\d+)\)/g, (str, index) => {
          return paths[index];
        });
        templates.push({ name, file });
      });
    });
  } else {
    let files = globby.sync(opts.template);
    templates = files.map(file => ({
      name: path.basename(file).split('.')[0],
      file: file
    }));
  }
  return templates;
}

//生成排除配置
function makeExternal(commonjs, root, amd) {
  amd = amd || commonjs;
  let commonjs2 = commonjs;
  return { commonjs, commonjs2, root, amd };
}

module.exports = function (ctx, opts){
  let config;
  let entries;// opts.entry 经由 webpackrc-cfg 转化为对象形式并缓存
  let entriesWithInjectModules = {};// 混入待加载的公共模块
  let babel;// opts.babel 配置
  let templates;// html 模板
  let resolve;

  // 创建 loader, plugin 实例
  const babelLoader = new BabelLoader();
  const vueLoader = new VueLoader();
  const jsonLoader = new JsonLoader();
  const rawLoader = new RawLoader();
  const ejsLoader = new EjsLoader();
  const urlLoader = new UrlLoader();
  const cssLoader = new CssLoader();
  const cssExtractLoader = new CssExtractLoader();
  const lessLoader = new LessLoader();
  const fastSassLoader = new FastSassLoader();

  // 安装 loader, plugin
  await installDependency();

  // 混入默认值
  opts = mixinDefaultOpts(opts);
  templates = getTemplates();

  let config = new WebpackConfig();
  config.mode = opts.mode;
  config.context = ctx.cwd;

  // 入口文件
  config.entry = opts.entry;
  entries = config.entry;
  Object.keys(entries).map(name => {
    entriesWithInjectModules[name] = [...opts.inject, entries[name]];
  });
  config.entry = entriesWithInjectModules;

  // 输出
  config.output = {
    publicPath: opts.publicPath,
    path: path.resolve(ctx.cwd, opts.output),
    filename: `${opts.folders.js}/[name].js`,
    chunkFilename: opts.chunkFilename,
    ...opts.umd
  };

  // 加载器
  babel = opts.babel;
  config.rules = [{
    test: /\.(js|jsx|mjs)$/,
    loader: babelLoader.module,
    options: babelLoader.getOptions({
      babelrc: true,
      cacheDirectory: true,
      presets: [
        ...babel.presets,
        new Babel_Preset_Env({
          targets: babel.targets || {
            browsers: babel.browsers,
            uglify: babel.uglify
          },
          include: babel.include,
          exclude: babel.exclude,
          loose: babel.loose,
          modules: babel.modules,
          useBuiltIns: babel.useBuiltIns,
          spec: babel.spec,
          debug: babel.debug
        }),
        babel.react && new Babel_Preset_React(),
        new Babel_Preset_Stage_0()
      ].filter(preset => !!preset),
      plugins: [
        ...babel.plugins,
        !!babel.transform && new Babel_Plugin_Transform_Runtime({
          helpers: babel.transform.helpers,
          polyfill: babel.transform.polyfill,
          regenerator: babel.transform.regenerator,
          moduleName: babel.transform.moduleName,
          useBuiltIns: babel.transform.useBuiltIns
        }),
        babel.modules == 'commonjs' && babel.addExports && new Babel_Plugin_Add_Module_Exports(),
        babel.strict && new Babel_Plugin_Transform_Remove_Strict_Mode()
      ].filter(plugin => !!plugin),
    }),
    exclude: [/node_modules/]
  }, {
    test: /\.vue$/,
    loader: vueLoader.module
  }, {
    test: /\.json$/,
    loader: jsonLoader.module
  }, {
    test: /\?raw$/,
    loader: rawLoader.module
  }, {
    test: /\.ejs$/,
    loader: ejsLoader.module
  }, {
    test: /\.html$/,
    loader: rawLoader.module
  }, {
    test: /\.(png|jpg|gif)\?*.*$/,
    loader: urlLoader.module,
    options: urlLoader.getOptions({
      limit: 8192,
      name: `${opts.folders.img}/[hash].[ext]`
    })
  }, {
    test: /\.(eot|woff|woff2|webfont|ttf|svg)\?*.*$/,
    loader: urlLoader.module,
    options: urlLoader.getOptions({
      limit: 8192,
      name: `${opts.folders.font}/[hash].[ext]`
    })
  }, {
    test: /\.less$/,
    use: [{
      loader: cssExtractLoader.module,
      options: cssExtractLoader.getOptions({
        publicPath: '../'
      })
    }, {
      loader: cssLoader.module,
      options: cssLoader.getOptions({
        modules: opts.cssModules,
        camelCase: opts.cssModules
      })
    }, { 
      loader: lessLoader.module
    }]
  }, {
    test: /\.(scss|sass)$/,
    use: [{
      loader: cssExtractLoader.module,
      options: cssExtractLoader.getOptions({
        publicPath: '../'
      })
    }, {
      loader: cssLoader.module,
      options: cssLoader.getOptions({
        modules: opts.cssModules,
        camelCase: opts.cssModules
      })
    }, { 
      loader: fastSassLoader.module
    }]
  }, {
    test: /\.css$/,
    use: [{
      loader: cssExtractLoader.module,
      options: cssExtractLoader.getOptions({
        publicPath: '../'
      })
    }, {
      loader: cssLoader.module,
      options: cssLoader.getOptions({
        modules: opts.cssModules,
        camelCase: opts.cssModules
      })
    }]
  }, ...opts.loaders];

  // 解析
  resolve = {
    extensions: ['.js', '.mjs', '.json', '.jsx', '.css', '.less', '.scss', '.sass'],
    symlinks: true,
    modules: [
      path.resolve(ctx.cwd, './node_modules/'),
      path.resolve(__dirname, '../node_modules/'),
      this.cwd,
      path.resolve(__dirname, '../')
    ],
  };
  config.resolve = {
    ...resolve,
    resolveLoader: resolve
  };

  // 插件
  config.plugins = [
    ...entries.forEach(name => {
      let template = templates.find(item => item.name == name) || templates[0];
      return template ? new HtmlWebpackPlugin().getPlugin({
        filename: `./${opts.folders.html}/${name}.html`,
        template: template.file,
        chunks: [opts.common.name, name]
      }) : undefined;
    }).filter(plugin => !!plugin),
    new MiniCssExtractPlugin().getPlugin({
      filename: `${opts.folders.css}/[name].css`
    }),
    !babel.common.disabled && new CommonsChunkPlugin().getPlugin({
      name: opts.common.name,
      chunks: opts.common.chunks
    }),
    opts.stats && new WebpackVisualizerPlugin().getPlugin({
      filename: './report/stats.html'
    }),
    // opts.optimization && new ModuleConcatenationPlugin().getPlugin({
    //   optimizationBailout: true
    // }),
    !opts.watch && opts.env && new DefinePlugin().getPlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(opts.env)//production
      }
    }), 
    opts.compress && new OptimizeCssAssetsPlugin({
      assetNameRegExp: /\.css$/g,
      cssProcessor: cssnano({
        safe: true
      }),
      cssProcessorOptions: {
        discardComments: {
          removeAll: true
        }
      },
      canPrint: false
    })
  ].filter(plugin => !!plugin);

  config.devtool = opts.sourceMap;

  // 外部扩展
  config.externals = !opts.external || (opts.watch && !opts.external) ? {} : opts.externals ||  
    opts.library ? {
      'jquery': makeExternal('jquery', 'jQuery'),
      'zepto': makeExternal('zepto', 'Zepto'),
      'react': makeExternal('react', 'React'),
      'react-dom': makeExternal('react-dom', 'ReactDOM')
    } : {
      'jquery': 'jQuery',
      'zepto': 'Zepto',
      'react': 'React',
      'react-dom': 'ReactDOM'
    };

  // 压缩
  if ( opts.compress )
    config.optimization = {
      removeAvailableModules: true,
      removeEmptyChunks: true,
      mergeDuplicateChunks: true,
      minimize: true
    };

  console.log(config.options)
  return config.options;
};