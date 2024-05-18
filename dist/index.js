import path from "node:path";
import fs from "node:fs";
import { loadConfigFromFile, mergeConfig, createServer, build } from "vite";
function multiple(apps, options = {}) {
  let config;
  return {
    name: "vite-plugin-multiple",
    config(config2) {
      config2.clearScreen ?? (config2.clearScreen = false);
    },
    async configResolved(_config) {
      config = _config;
    },
    configureServer(server) {
      if (server.httpServer) {
        server.httpServer.once(
          "listening",
          () => run(config, apps, "serve").then(() => {
            var _a;
            return (_a = options.callback) == null ? void 0 : _a.call(options);
          })
        );
      } else {
        run(config, apps, "serve").then(() => {
          var _a;
          return (_a = options.callback) == null ? void 0 : _a.call(options);
        });
      }
    },
    async closeBundle() {
      var _a;
      if (config.command === "build") {
        await run(config, apps, config.command);
        (_a = options.callback) == null ? void 0 : _a.call(options);
      }
    }
  };
}
async function resolveConfig(config, app) {
  var _a;
  const { config: userConfig } = await loadConfigFromFile({
    command: app.command,
    mode: config.mode,
    isSsrBuild: !!((_a = config.build) == null ? void 0 : _a.ssr)
  }, app.config) ?? { path: "", config: {}, dependencies: [] };
  const defaultConfig = {
    root: config.root,
    mode: config.mode,
    build: {
      outDir: !userConfig.root || userConfig.root === /* conflict */
      config.root ? path.posix.join(config.build.outDir, app.name) : void 0
    },
    clearScreen: false
  };
  return mergeConfig(defaultConfig, userConfig);
}
async function run(config, apps, mainAppCommand) {
  var _a;
  let port = 5174;
  for (const app of apps) {
    app.command ?? (app.command = mainAppCommand);
    const userConfig = await resolveConfig(config, app);
    if (app.command === "serve") {
      userConfig.server ?? (userConfig.server = {});
      (_a = userConfig.server).port ?? (_a.port = port++);
      const viteDevServer = await createServer({
        configFile: false,
        ...userConfig
      });
      if (!app.exitHandlersBound) {
        const onClose = () => {
          var _a2;
          (_a2 = app.closed) == null ? void 0 : _a2.call(app, app, userConfig, viteDevServer);
          if (app.hotFile && fs.existsSync(app.hotFile)) {
            fs.rmSync(app.hotFile);
          }
        };
        process.on("exit", onClose);
        process.on("SIGINT", () => process.exit());
        process.on("SIGTERM", () => process.exit());
        process.on("SIGHUP", () => process.exit());
        app.exitHandlersBound = true;
      }
      await viteDevServer.listen();
      viteDevServer.printUrls();
    } else {
      await build({
        // 🚧 Avoid recursive build caused by load default config file.
        configFile: false,
        ...userConfig
      });
    }
  }
}
export {
  multiple as default,
  resolveConfig,
  run
};
