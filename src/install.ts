import { binaryStatus } from "./cli.js";

export interface BinaryAvailability {
  bw?: boolean;
  brew?: boolean;
  npm?: boolean;
  winget?: boolean;
  choco?: boolean;
}

export interface BwInstallHint {
  platform: NodeJS.Platform;
  arch: string;
  installed: boolean;
  detectedTools: BinaryAvailability;
  recommended: {
    manager: string;
    command: string;
    reason: string;
  };
  alternatives: Array<{
    manager: string;
    command: string;
    reason: string;
  }>;
  nextSteps: string[];
}

export async function getBwInstallHint(): Promise<BwInstallHint> {
  const [bw, brew, npm, winget, choco] = await Promise.all([
    binaryStatus("bw"),
    binaryStatus("brew"),
    binaryStatus("npm"),
    binaryStatus("winget"),
    binaryStatus("choco")
  ]);

  return buildBwInstallHint(process.platform, process.arch, {
    bw: bw.available,
    brew: brew.available,
    npm: npm.available,
    winget: winget.available,
    choco: choco.available
  });
}

export function buildBwInstallHint(
  platform: NodeJS.Platform,
  arch: string,
  tools: BinaryAvailability
): BwInstallHint {
  const alternatives: BwInstallHint["alternatives"] = [];

  if (tools.bw) {
    return {
      platform,
      arch,
      installed: true,
      detectedTools: tools,
      recommended: {
        manager: "bw",
        command: "bw --version",
        reason: "Bitwarden CLI is already available on PATH."
      },
      alternatives,
      nextSteps: [
        "Run configure_bw_server if this machine has not been pointed at your Vaultwarden server.",
        "Run bw login --apikey or unlock an existing session locally.",
        "Expose BW_SESSION to the plugin environment before using secret-bearing tools."
      ]
    };
  }

  if (platform === "darwin" && tools.brew) {
    alternatives.push(npmAlternative(tools));
    return hint(platform, arch, tools, {
      manager: "homebrew",
      command: "brew install bitwarden-cli",
      reason: "Homebrew is the most convenient Bitwarden CLI install path on macOS."
    }, alternatives);
  }

  if (platform === "win32" && tools.winget) {
    if (tools.choco) {
      alternatives.push({
        manager: "chocolatey",
        command: "choco install bitwarden-cli",
        reason: "Chocolatey is a common Windows package manager fallback."
      });
    }
    alternatives.push(npmAlternative(tools));
    return hint(platform, arch, tools, {
      manager: "winget",
      command: "winget install Bitwarden.CLI",
      reason: "winget is the built-in Windows package manager on modern Windows."
    }, alternatives);
  }

  if (tools.npm) {
    return hint(platform, arch, tools, npmAlternative(tools), alternatives);
  }

  return hint(platform, arch, tools, {
    manager: "manual",
    command: "Install Bitwarden CLI from https://bitwarden.com/help/cli/",
    reason: "No supported local package manager was detected."
  }, alternatives);
}

function hint(
  platform: NodeJS.Platform,
  arch: string,
  tools: BinaryAvailability,
  recommended: BwInstallHint["recommended"],
  alternatives: BwInstallHint["alternatives"]
): BwInstallHint {
  return {
    platform,
    arch,
    installed: false,
    detectedTools: tools,
    recommended,
    alternatives: alternatives.filter((item) => item.command !== recommended.command),
    nextSteps: [
      "Install Bitwarden CLI with the recommended command outside the plugin.",
      "Run bw config server https://your-vaultwarden.example.com.",
      "Run bw login --apikey, then bw unlock, and pass BW_SESSION into the plugin environment."
    ]
  };
}

function npmAlternative(tools: BinaryAvailability): BwInstallHint["recommended"] {
  return {
    manager: "npm",
    command: "npm install -g @bitwarden/cli",
    reason: tools.npm
      ? "npm is available and Bitwarden publishes the CLI as @bitwarden/cli."
      : "Use this only after installing Node.js/npm."
  };
}

