import { runCmd } from "./exec";

export const docker = async (args: string[], cwd?: string) =>
  runCmd("docker", args, cwd);

export const ensureDocker = async () => {
  try {
    await docker(["info"]);
    return true;
  } catch {
    return false;
  }
};

export const inspectImage = async (image: string) =>
  docker(["image", "inspect", image]);

export const buildImage = async (tag: string, context: string) =>
  docker(["build", "-t", tag, "."], context);

export const dockerExec = async (container: string, args: string[]) =>
  docker(["exec", container, ...args]);

/** Environment variables to pass to a container. Object with string keys and string values. Example: `{ DATABASE_URL: "postgres://...", DEBUG: "true" }` */
type ContainerEnv = Record<string, string>;

type PublishedPort = {
  /** The port or interface:port on the host machine. Example: "8080" or "127.0.0.1:8080" */
  host: string | number;
  /** The port exposed by the container. Example: "3000" */
  container: string | number;
};

type MountedVolume = {
  /** The host path to mount. Example: "/host/data" */
  source: string;
  /** The container path to mount to. Example: "/app/data" */
  target: string;
  /** Whether the volume should be read-only. Default: false (writable) */
  readOnly?: boolean;
};

export const args = {
  name: <T extends string>(name: T) => ["--name", name] as const,
  network: <T extends string>(network: T) => ["--network", network] as const,
  removeOnStop: "--rm",
  detached: "-d",
  env: (key: string, value: string) => ["-e", `${key}=${value}`] as const,
  ports: ({ host, container }: PublishedPort) =>
    ["-p", `${host}:${container}`] as const,
  volumes: ({ source, target, readOnly }: MountedVolume) =>
    ["-v", `${source}:${target}${readOnly ? ":ro" : ""}`] as const,
} as const;

type RunContainerOptions = {
  /** Docker image to run (required). Example: "node:20", "browser-control" */
  image: string;
  /** Command and arguments to execute in the container. Default: none */
  command?: string[];
  /** Container name for identification. Default: Docker auto-generated name */
  name?: string;
  /** Network to connect the container to. Default: default bridge network */
  network?: string;
  /** Environment variables to set in the container. Default: none */
  env?: ContainerEnv;
  /** Ports to publish from container to host. Default: none */
  ports?: PublishedPort[];
  /** Volumes to mount into the container. Default: none */
  volumes?: MountedVolume[];
  /** Additional docker run arguments (e.g., ["--cap-add", "SYS_ADMIN"]). Default: none */
  extraArgs?: string[];
  /** Working directory for executing the docker command. Default: process.cwd() */
  cwd?: string;
  /** Run container in detached mode (background). Default: true */
  detached?: boolean;
  /** Automatically remove container when it stops. Default: true */
  removeOnStop?: boolean;
};

export const runContainer = async ({
  image,
  command,
  name,
  network,
  env,
  ports,
  volumes,
  extraArgs,
  cwd,
  detached = true,
  removeOnStop = true,
}: RunContainerOptions) => {
  const dockerArgs = ["run"];

  if (detached) dockerArgs.push(args.detached);
  if (removeOnStop) dockerArgs.push(args.removeOnStop);

  if (name) dockerArgs.push(...args.name(name));
  if (network) dockerArgs.push(...args.network(network));

  if (env)
    for (const [key, value] of Object.entries(env))
      dockerArgs.push(...args.env(key, value));

  if (ports) for (const port of ports) dockerArgs.push(...args.ports(port));

  if (volumes)
    for (const volume of volumes) dockerArgs.push(...args.volumes(volume));

  if (extraArgs) dockerArgs.push(...extraArgs);

  dockerArgs.push(image);
  if (command?.length) dockerArgs.push(...command);

  return docker(dockerArgs, cwd);
};

/**
 * Remove a container.
 * @param name - The name of the container to remove.
 * @param force - Force removal without stopping. Default: true
 */
export const removeContainer = async (name: string, force = true) =>
  docker(["rm", ...(force ? ["-f"] : []), name]);
