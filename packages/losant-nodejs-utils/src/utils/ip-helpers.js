import * as ipLib from 'neoip';
import net from 'net';

export const isIPv4Address = net.isIPv4;
export const isIPv6Address = net.isIPv6;

export const isIpAddress = (ip) => isIPv4Address(ip) || isIPv6Address(ip);
export const isPublicIp = (ip) => {
  if (isIPv4Address(ip)) {
    return !ipLib.isPrivate(ip);
  }
  if (isIPv6Address(ip)) {
    // 2001 / 2002 are supposed to be reserved/private .... but are apparently still used?
    return !ipLib.isPrivate(ip) || ip.startsWith('2001:') || ip.startsWith('2002:');
  }
  return false;
};
export const isLoopbackIp = (ip) => isIpAddress(ip) && ipLib.isLoopback(ip);


export const isIpEqual = (ip1, ip2) => ipLib.isEqual(ip1, ip2);

export const cidrSubnet = (ip) => ipLib.cidrSubnet(ip);

// check is weird, and some v4 addresses look like valid v6 addresses
// so it is only *really* v6 if it is not v4
export const addressToUdpSocketType = (ip) => ((!net.isIPv4(ip) && net.isIPv6(ip)) ? 'udp6' : 'udp4');
