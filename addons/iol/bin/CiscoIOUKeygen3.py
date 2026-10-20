#!/usr/bin/env python3
# Cisco IOU License Generator — Kal 2011 (python3 port of the 2006 C version).
#
# Generates the host-locked IOU license and writes /opt/unetlab/addons/iol/bin/iourc
# for THIS host (the key is derived from hostid+hostname, so a shipped/fixed iourc is
# wrong on every other box and IOL nodes fail to license). Run once per host — the
# installer runs it at install time.
#
# NOTE: unlike the stock keygen's printed instructions, this deliberately does NOT add
# the "127.0.0.1 xml.cisco.com" phone-home null-route to /etc/hosts — this build is
# offline-hardened and that entry is intentionally kept out of /etc/hosts.
#
# Usage:
#   CiscoIOUKeygen3.py            -> compute + write the iourc, print the key
#   CiscoIOUKeygen3.py --print    -> compute + print only (do not write)
#   IOURC=/path CiscoIOUKeygen3.py-> write to a custom iourc path

import os
import sys
import socket
import hashlib
import struct

# host id + host name drive the key (identical algorithm to the original py2 keygen)
hostid = os.popen("hostid").read().strip()
hostname = socket.gethostname()

ioukey = int(hostid, 16)
for ch in hostname:
    ioukey += ord(ch)

# MD5 over the fixed IOU pads + the packed ioukey -> first 16 hex chars = the license
iou_pad1 = b'\x4B\x58\x21\x81\x56\x7B\x0D\xF3\x21\x43\x9B\x7E\xAC\x1D\xE6\x8A'
iou_pad2 = b'\x80' + 39 * b'\x00'
md5input = iou_pad1 + iou_pad2 + struct.pack('!L', ioukey) + iou_pad1
license_key = hashlib.md5(md5input).hexdigest()[:16]

print("hostid=%s, hostname=%s, ioukey=%s" % (hostid, hostname, hex(ioukey)[2:]))
print("[license]\n%s = %s;" % (hostname, license_key))

if "--print" not in sys.argv:
    iourc_path = os.environ.get("IOURC", "/opt/unetlab/addons/iol/bin/iourc")
    try:
        with open(iourc_path, "w") as fh:
            fh.write("[license]\n%s = %s;\n" % (hostname, license_key))
        print("Wrote %s" % iourc_path)
    except OSError as exc:
        sys.stderr.write("ERROR: could not write %s: %s\n" % (iourc_path, exc))
        sys.exit(1)
