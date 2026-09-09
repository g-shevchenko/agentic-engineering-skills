# Security

## Supported Use

This repository contains local agent skill instructions and shell scripts that copy those instructions into a local skills directory.

The installer should not:

- request or print secrets;
- call external APIs;
- install package dependencies;
- modify shell profiles;
- change git remotes;
- execute downloaded code from the network.

## Reporting Issues

Open a GitHub issue if you find a security problem in the installer, trust manifest, or public documentation.

Do not paste secrets into issues. Redact tokens, hostnames, and private repository names.
