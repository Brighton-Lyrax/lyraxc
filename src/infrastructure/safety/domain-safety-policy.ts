import type { SafetyPolicy } from '../../domain/ports.js';
import { SafetyError } from '../../shared/errors.js';
import { hostnameOf } from '../../shared/utils.js';

/**
 * Domain allow/block-list safety policy.
 *
 * - If `blockedDomains` matches the target host, navigation is always denied.
 * - If `allowedDomains` is non-empty, only matching hosts are permitted.
 * - Matching is suffix-based, so `example.com` also matches `www.example.com`.
 */
export class DomainSafetyPolicy implements SafetyPolicy {
  constructor(
    private readonly allowedDomains: string[],
    private readonly blockedDomains: string[],
  ) {}

  assertNavigationAllowed(url: string): void {
    const host = hostnameOf(url);
    if (!host) {
      throw new SafetyError(`Invalid or unsupported URL: ${url}`);
    }

    if (this.matches(host, this.blockedDomains)) {
      throw new SafetyError(`Navigation to blocked domain is not allowed: ${host}`, {
        host,
      });
    }

    if (this.allowedDomains.length > 0 && !this.matches(host, this.allowedDomains)) {
      throw new SafetyError(
        `Navigation to ${host} is not in the allow-list`,
        { host, allowedDomains: this.allowedDomains },
      );
    }
  }

  /** True when `host` equals or is a subdomain of any entry in `list`. */
  private matches(host: string, list: string[]): boolean {
    return list.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  }
}
