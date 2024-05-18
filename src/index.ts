import path from 'node:path'
import fs from 'node:fs'
import {
  type Plugin,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  build as viteBuild,
  createServer,
  loadConfigFromFile,
  mergeConfig,
} from 'vite'

export type AppConfig = Parameters<typeof multiple>[0][number]

export default function multiple(
	apps: {
		/**
		 * Human friendly name of your entry point.
		 */
		name: string;
		/**
		 * Vite config file path.
		 */
		config: string;
		/**
		 * vite-plugin-laravel hot file path.
		 */
		hotFile?: string;
		/**
		 * Explicitly specify the run command.
		 */
		command?: "build" | "serve";
		/*
		 * Called before serve is stopping.
		 */
		closed?: (
			app: AppConfig,
			config: UserConfig,
			server: ViteDevServer
		) => void;
		/*
		 * Exit Handlers Bound each app
		 */
		exitHandlersBound?: boolean;
	}[],
	options: {
		/**
		 * Called when all builds are complete.
		 */
		callback?: () => void;
	} = {}
): Plugin {
	let config: ResolvedConfig;

	return {
		name: "vite-plugin-multiple",
		config(config) {
			config.clearScreen ??= false;
		},
		async configResolved(_config) {
			config = _config;
		},
		configureServer(server) {
			if (server.httpServer) {
				server.httpServer.once("listening", () =>
					run(config, apps, "serve").then(() => options.callback?.())
				);
			} else {
				run(config, apps, "serve").then(() => options.callback?.());
			}
		},
		async closeBundle() {
			if (config.command === "build") {
				await run(config, apps, config.command);
				options.callback?.();
			}
		},
	};
}

export async function resolveConfig(config: ResolvedConfig, app: AppConfig): Promise<UserConfig> {
  const { config: userConfig } = (await loadConfigFromFile({
    command: app.command!,
    mode: config.mode,
    isSsrBuild: !!config.build?.ssr,
  }, app.config)) ?? { path: '', config: {}, dependencies: [] };
  const defaultConfig: UserConfig = {
    root: config.root,
    mode: config.mode,
    build: {
      outDir: !userConfig.root || userConfig.root === /* conflict */config.root
        ? path.posix.join(config.build.outDir, app.name)
        : undefined,
    },
    clearScreen: false,
  }
  return mergeConfig(defaultConfig, userConfig);
}

export async function run(
  config: ResolvedConfig,
  apps: AppConfig[],
  mainAppCommand: ResolvedConfig['command'],
): Promise<void> {
  let port = 5174 // The port of main App is 5173

  for (const app of apps) {
    app.command ??= mainAppCommand

    const userConfig = await resolveConfig(config, app)

    if (app.command === 'serve') {
      userConfig.server ??= {}
      userConfig.server.port ??= port++

      const viteDevServer = await createServer({
        configFile: false,
        ...userConfig,
      })

      if (!app.exitHandlersBound) {
				const onClose = () => {
					app.closed?.(app, userConfig, viteDevServer);

					//TODO make available for laravel-vite-plugin to remove hot file on command close/exit
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

      await viteDevServer.listen()
      viteDevServer.printUrls()
    } else {
      await viteBuild({
        // 🚧 Avoid recursive build caused by load default config file.
        configFile: false,
        ...userConfig,
      })
    }
  }
}
