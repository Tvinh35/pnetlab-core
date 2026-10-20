/**
 * pnetlab-import-json.js — "Import JSON Topology" lab-view feature.
 *
 * Adds a sidebar entry (#pnq-importjson) and context menu integration that opens a modal:
 *   • Tab 1: Paste or drag-and-drop a JSON topology file to import directly into open canvas
 *   • Tab 2: Export the open lab via POST /api/labs/session/topology_json/export
 *   • Tab 3: Templates mẫu & Hướng dẫn: Tải template chuẩn chứa đầy đủ mọi trường thông tin
 *            và ví dụ cụ thể cho từng loại node (IOL, QEMU, Dynamips, VPCS, Docker)
 *            tuân theo các image có sẵn trên máy ảo và kho 473 image của PNetLab v8.
 */
(function () {
  'use strict';

  /* ── Master Template Data ────────────────────────────────────────────── */
  var TEMPLATES_DATA = {
    full: {
      filename: "pnetlab_full_topology_template.json",
      url: "/themes/default/templates_json/pnetlab_full_topology_template.json"
    },
    iol: {
      id: "iol",
      name: "Cisco IOL",
      badge: "ĐÃ CÓ SẴN TRÊN MÁY ẢO",
      badgeColor: "#10b981",
      icon: "fa-server",
      filename: "template_iol.json",
      desc: "Chạy Cisco IOS dạng native Linux process nhẹ, hiệu năng cực cao. Máy ảo này đã cài sẵn 3 image IOL chuẩn.",
      imageDir: "/opt/unetlab/addons/iol/bin/",
      installedImages: [
        "L3-ADVENTERPRISEK9-M-15.4-2T.bin",
        "L2-ADVENTERPRISEK9-M-15.2-IRON-20151103.bin",
        "L2-ADVENTERPRISEK9-M-15.2-20150703.bin"
      ],
      schema: {
        "name": "R1",
        "type": "iol",
        "template": "iol",
        "image": "L3-ADVENTERPRISEK9-M-15.4-2T.bin",
        "ram": 1024,
        "nvram": 1024,
        "ethernet": 4,
        "serial": 0,
        "keepalive": 0,
        "iol_options": "",
        "icon": "Router.png",
        "left": 250,
        "top": 200,
        "delay": 0,
        "config": 1,
        "config_data": "hostname R1\n!\ninterface Ethernet0/0\n ip address 10.0.0.1 255.255.255.0\n no shutdown\n!\nend\n"
      },
      fields: [
        { name: "name", req: true, type: "string", desc: "Tên định danh node, mặc định theo prefix khi thêm thủ công (vd: 'R1', 'SW1')" },
        { name: "type", req: true, type: "string", desc: "Loại thiết bị, với IOL luôn khai báo là 'iol'" },
        { name: "template", req: true, type: "string", desc: "Tên template thiết bị, luôn khai báo là 'iol'" },
        { name: "image", req: true, type: "string", desc: "Tên file image có sẵn trong /opt/unetlab/addons/iol/bin/ ('L3-ADVENTERPRISEK9-M-15.4-2T.bin' hoặc 'L2-ADVENTERPRISEK9-M-15.2-IRON-20151103.bin')" },
        { name: "ram", req: false, type: "integer", desc: "Dung lượng RAM (MB), mặc định 1024 (hoặc 512)" },
        { name: "nvram", req: false, type: "integer", desc: "Dung lượng NVRAM (KB), mặc định 1024" },
        { name: "ethernet", req: false, type: "integer", desc: "Số nhóm cổng Ethernet (mỗi nhóm = 4 cổng eX/0-3). ethernet=4 tạo ra 16 cổng" },
        { name: "serial", req: false, type: "integer", desc: "Số nhóm cổng Serial (mỗi nhóm = 4 cổng sX/0-3)" },
        { name: "keepalive", req: false, type: "integer", desc: "Giữ kết nối keepalive: 0 (tắt) hoặc 1 (bật)" },
        { name: "iol_options", req: false, type: "string", desc: "Tham số dòng lệnh bổ sung cho tiến trình IOL" },
        { name: "icon", req: false, type: "string", desc: "Icon hiển thị trên canvas: 'Router.png', 'Switch.png', 'Router-2D-Gen-White-S.svg'" },
        { name: "left / top", req: false, type: "integer", desc: "Tọa độ X và Y trên canvas (pixel), bỏ trống sẽ tự động sắp xếp dạng lưới" },
        { name: "config_data", req: false, type: "string", desc: "Toàn văn cấu hình CLI khởi động của thiết bị" }
      ],
      example: {
        "nodes": [
          {
            "name": "R1",
            "type": "iol",
            "template": "iol",
            "image": "L3-ADVENTERPRISEK9-M-15.4-2T.bin",
            "ram": 1024,
            "nvram": 1024,
            "ethernet": 4,
            "serial": 0,
            "icon": "Router.png",
            "left": 250,
            "top": 200,
            "config_data": "hostname R1\ninterface Ethernet0/0\n description Uplink to SW1\n ip address 10.0.0.1 255.255.255.0\n no shutdown\n"
          },
          {
            "name": "SW1",
            "type": "iol",
            "template": "iol",
            "image": "L2-ADVENTERPRISEK9-M-15.2-IRON-20151103.bin",
            "ram": 1024,
            "nvram": 1024,
            "ethernet": 4,
            "serial": 0,
            "icon": "Switch.png",
            "left": 550,
            "top": 200,
            "config_data": "hostname SW1\nvlan 10,20\ninterface Ethernet0/0\n switchport mode trunk\n"
          }
        ],
        "links": [
          {
            "src_node": "R1",
            "src_interface": "e0/0",
            "dst_node": "SW1",
            "dst_interface": "e0/0"
          }
        ]
      }
    },
    vpcs: {
      id: "vpcs",
      name: "VPCS",
      badge: "TÍCH HỢP SẴN TRÊN MÁY ẢO",
      badgeColor: "#10b981",
      icon: "fa-terminal",
      filename: "template_vpcs.json",
      desc: "Máy trạm siêu nhẹ tích hợp sẵn trong PNetLab, khởi động tức thì, không cần tải bất kỳ file image nào.",
      imageDir: "Tích hợp sẵn (/opt/vpcsu/bin/vpcs)",
      schema: {
        "name": "VPC1",
        "type": "vpcs",
        "template": "vpcs",
        "image": "",
        "ethernet": 1,
        "icon": "Desktop.png",
        "left": 250,
        "top": 200,
        "delay": 0,
        "config": 1,
        "config_data": "set pcname VPC1\nip 192.168.1.50/24 192.168.1.1\n"
      },
      fields: [
        { name: "name", req: true, type: "string", desc: "Tên định danh VPC (mặc định 'VPC1', 'VPC2' khi thêm thủ công)" },
        { name: "type", req: true, type: "string", desc: "Loại thiết bị, luôn là 'vpcs'" },
        { name: "template", req: true, type: "string", desc: "Template thiết bị, luôn là 'vpcs'" },
        { name: "image", req: false, type: "string", desc: "Để chuỗi rỗng '' (VPCS không cần image)" },
        { name: "ethernet", req: false, type: "integer", desc: "Số cổng mạng của VPCS (mặc định 1 cổng eth0)" },
        { name: "icon", req: false, type: "string", desc: "Icon máy tính hiển thị ('Desktop.png', 'PC-2D-Desktop-Generic-S.svg')" },
        { name: "left / top", req: false, type: "integer", desc: "Tọa độ X và Y trên canvas" },
        { name: "config_data", req: false, type: "string", desc: "Lệnh cấu hình sẵn của VPCS (vd: 'ip 192.168.1.10/24 192.168.1.1' hoặc 'dhcp')" }
      ],
      example: {
        "nodes": [
          {
            "name": "VPC1",
            "type": "vpcs",
            "template": "vpcs",
            "ethernet": 1,
            "icon": "Desktop.png",
            "left": 250,
            "top": 200,
            "config_data": "set pcname VPC1\nip 192.168.1.10/24 192.168.1.1\n"
          },
          {
            "name": "VPC2",
            "type": "vpcs",
            "template": "vpcs",
            "ethernet": 1,
            "icon": "Desktop.png",
            "left": 550,
            "top": 200,
            "config_data": "set pcname VPC2\ndhcp\n"
          }
        ],
        "links": [
          {
            "src_node": "VPC1",
            "src_interface": "eth0",
            "dst_node": "VPC2",
            "dst_interface": "eth0"
          }
        ]
      }
    },
    qemu: {
      id: "qemu",
      name: "QEMU / KVM",
      badge: "KHO 459 IMAGE PNETLAB",
      badgeColor: "#3b82f6",
      icon: "fa-desktop",
      filename: "template_qemu.json",
      desc: "Kho PNetLab v8 có sẵn 459 Image QEMU (Cisco CSR1000v, FortiGate, MikroTik, Linux, Windows,...). Tải qua menu System -> Get Image.",
      imageDir: "/opt/unetlab/addons/qemu/",
      schema: {
        "name": "CSR1",
        "type": "qemu",
        "template": "csr1000vng",
        "image": "csr1000vng-universalk9.16.09.05-serial",
        "cpu": 2,
        "cpulimit": 1,
        "ram": 4096,
        "ethernet": 4,
        "console": "telnet",
        "console_2nd": "",
        "qemu_arch": "x86_64",
        "qemu_nic": "vmxnet3",
        "qemu_options": "-machine type=pc,accel=kvm -cpu host -serial mon:stdio -nographic -no-user-config -nodefaults -rtc base=utc",
        "firstmac": "50:00:00:01:00:00",
        "icon": "CSRv1000.png",
        "left": 250,
        "top": 200,
        "delay": 0,
        "config": 1,
        "config_data": "hostname CSR1\ninterface GigabitEthernet1\n ip address 10.1.1.1 255.255.255.0\n no shutdown\n",
        "username": "admin",
        "password": "Password123!"
      },
      fields: [
        { name: "name", req: true, type: "string", desc: "Tên định danh node trên sơ đồ (vd: 'CSR1', 'CSR2' theo prefix mặc định)" },
        { name: "type", req: true, type: "string", desc: "Loại thiết bị, luôn là 'qemu'" },
        { name: "template", req: true, type: "string", desc: "Template định dạng máy ảo ('csr1000vng', 'csr1000v', 'fortinet', 'vios', 'linux')" },
        { name: "image", req: true, type: "string", desc: "Tên folder image trong /opt/unetlab/addons/qemu/ ('csr1000vng-universalk9.16.09.05-serial')" },
        { name: "cpu", req: false, type: "integer", desc: "Số vCPU cấp phát cho máy ảo (1-4, mặc định 2)" },
        { name: "cpulimit", req: false, type: "integer", desc: "1: Bật giới hạn tiêu thụ CPU host; 0: Không giới hạn" },
        { name: "ram", req: false, type: "integer", desc: "Dung lượng RAM cấp phát (MB), CSR1000v mặc định 4096 (hoặc 3072)" },
        { name: "ethernet", req: false, type: "integer", desc: "Số card mạng ảo (NIC) của máy ảo (mặc định 4)" },
        { name: "console", req: false, type: "string", desc: "Giao thức console kết nối: 'telnet', 'vnc', hoặc 'rdp'" },
        { name: "qemu_arch", req: false, type: "string", desc: "Kiến trúc CPU: 'x86_64' hoặc 'i386'" },
        { name: "qemu_nic", req: false, type: "string", desc: "Loại driver card mạng: 'vmxnet3', 'virtio-net-pci', 'e1000'" },
        { name: "qemu_options", req: false, type: "string", desc: "Tham số dòng lệnh tùy chỉnh bổ sung cho QEMU" },
        { name: "firstmac", req: false, type: "string", desc: "Địa chỉ MAC cơ sở cho card mạng (định dạng 50:00:00:xx:xx:xx)" },
        { name: "icon", req: false, type: "string", desc: "Tên file icon hiển thị trên canvas ('CSRv1000.png', 'Router-2D-Cat-Blue-S.svg')" },
        { name: "left / top", req: false, type: "integer", desc: "Tọa độ X và Y trên sơ đồ canvas" },
        { name: "config_data", req: false, type: "string", desc: "Cấu hình khởi động mẫu (nếu template hỗ trợ config injection)" }
      ],
      example: {
        "nodes": [
          {
            "name": "CSR1",
            "type": "qemu",
            "template": "csr1000vng",
            "image": "csr1000vng-universalk9.16.09.05-serial",
            "cpu": 2,
            "cpulimit": 1,
            "ram": 4096,
            "ethernet": 4,
            "console": "telnet",
            "icon": "CSRv1000.png",
            "left": 250,
            "top": 200,
            "config": 1,
            "config_data": "hostname CSR1\ninterface GigabitEthernet1\n ip address 10.10.10.1 255.255.255.0\n no shutdown\n",
            "username": "admin",
            "password": "Password123!"
          },
          {
            "name": "CSR2",
            "type": "qemu",
            "template": "csr1000vng",
            "image": "csr1000vng-universalk9.16.09.05-serial",
            "cpu": 2,
            "cpulimit": 1,
            "ram": 4096,
            "ethernet": 4,
            "console": "telnet",
            "icon": "CSRv1000.png",
            "left": 550,
            "top": 200,
            "config": 1,
            "config_data": "hostname CSR2\ninterface GigabitEthernet1\n ip address 10.10.10.2 255.255.255.0\n no shutdown\n",
            "username": "admin",
            "password": "Password123!"
          }
        ],
        "links": [
          {
            "src_node": "CSR1",
            "src_interface": "GigabitEthernet1",
            "dst_node": "CSR2",
            "dst_interface": "GigabitEthernet1"
          }
        ]
      }
    },
    docker: {
      id: "docker",
      name: "Docker Container",
      badge: "DOCKER LOCAL IMAGES",
      badgeColor: "#f59e0b",
      icon: "fa-cube",
      filename: "template_docker.json",
      desc: "Container hóa Linux ứng dụng nhanh, hỗ trợ các image có sẵn qua lệnh 'docker images'.",
      imageDir: "Docker local image cache",
      schema: {
        "name": "Docker1",
        "type": "docker",
        "template": "docker",
        "image": "pnet-capture-web:1.0",
        "ram": 1024,
        "ethernet": 2,
        "console": "telnet",
        "icon": "Docker.png",
        "left": 250,
        "top": 200,
        "delay": 0,
        "docker_options": "--privileged",
        "username": "root",
        "password": "pnetlabpassword"
      },
      fields: [
        { name: "name", req: true, type: "string", desc: "Tên container node trên sơ đồ (vd: 'Docker1', 'Docker2' theo prefix mặc định)" },
        { name: "type", req: true, type: "string", desc: "Loại thiết bị, luôn là 'docker'" },
        { name: "template", req: true, type: "string", desc: "Template thiết bị, luôn là 'docker'" },
        { name: "image", req: true, type: "string", desc: "Tên Docker image (phải có sẵn trên máy chủ qua lệnh 'docker images', vd: 'pnet-capture-web:1.0')" },
        { name: "ram", req: false, type: "integer", desc: "Bộ nhớ RAM giới hạn cho container (MB), mặc định 1024" },
        { name: "ethernet", req: false, type: "integer", desc: "Số card mạng veth kết nối ra lab (mặc định 2: eth0, eth1)" },
        { name: "console", req: false, type: "string", desc: "Giao thức console: 'telnet' hoặc 'http'" },
        { name: "icon", req: false, type: "string", desc: "Icon hiển thị ('Docker.png', 'Dockerserver-1.png')" },
        { name: "left / top", req: false, type: "integer", desc: "Tọa độ X và Y trên canvas" }
      ],
      example: {
        "nodes": [
          {
            "name": "Docker1",
            "type": "docker",
            "template": "docker",
            "image": "pnet-capture-web:1.0",
            "ram": 1024,
            "ethernet": 2,
            "console": "telnet",
            "icon": "Dockerserver-1.png",
            "left": 250,
            "top": 200,
            "docker_options": "--privileged"
          },
          {
            "name": "Docker2",
            "type": "docker",
            "template": "docker",
            "image": "pnet-capture-web:1.0",
            "ram": 1024,
            "ethernet": 2,
            "console": "telnet",
            "icon": "Dockerserver-1.png",
            "left": 550,
            "top": 200,
            "docker_options": "--privileged"
          }
        ],
        "links": [
          {
            "src_node": "Docker1",
            "src_interface": "eth0",
            "dst_node": "Docker2",
            "dst_interface": "eth0"
          }
        ]
      }
    }
  };

  /* ── Master Sample Topology (100% CÓ THỰC TẾ TRÊN MÁY ẢO) ────────────── */
  var READY_SAMPLE_TOPOLOGY = {
    "lab": {
      "name": "Sample-Working-Lab-PNetLab",
      "description": "Lab mẫu sử dụng 100% các Image có sẵn thực tế trên máy ảo PNetLab này, import là chạy ngay lập tức",
      "version": "1",
      "author": "PNetLab Admin",
      "darkmode": 1,
      "mode3d": 1
    },
    "nodes": [
      {
        "name": "R1",
        "type": "iol",
        "template": "iol",
        "image": "L3-ADVENTERPRISEK9-M-15.4-2T.bin",
        "ram": 1024,
        "nvram": 1024,
        "ethernet": 4,
        "serial": 0,
        "icon": "Router.png",
        "left": 250,
        "top": 200,
        "config_data": "hostname R1\ninterface Ethernet0/0\n description Link to SW1\n ip address 192.168.10.1 255.255.255.0\n no shutdown\n"
      },
      {
        "name": "SW1",
        "type": "iol",
        "template": "iol",
        "image": "L2-ADVENTERPRISEK9-M-15.2-IRON-20151103.bin",
        "ram": 1024,
        "nvram": 1024,
        "ethernet": 4,
        "serial": 0,
        "icon": "Switch.png",
        "left": 550,
        "top": 200,
        "config_data": "hostname SW1\nvlan 10,20\ninterface Ethernet0/0\n switchport mode trunk\n"
      },
      {
        "name": "VPC1",
        "type": "vpcs",
        "template": "vpcs",
        "ethernet": 1,
        "icon": "Desktop.png",
        "left": 550,
        "top": 400,
        "config_data": "set pcname VPC1\nip 192.168.10.50/24 192.168.10.1\n"
      }
    ],
    "links": [
      { "src_node": "R1", "src_interface": "e0/0", "dst_node": "SW1", "dst_interface": "e0/0" },
      { "src_node": "SW1", "src_interface": "e0/1", "dst_node": "VPC1", "dst_interface": "eth0" }
    ],
    "cloud_networks": [
      {
        "name": "Internet-NAT",
        "type": "pnet0",
        "icon": "Cloud.png",
        "left": 100,
        "top": 200,
        "connected_to": {
          "node": "R1",
          "interface": "e0/3"
        }
      }
    ]
  };

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  var CSS_ID = 'pnq-ij-style';
  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '#pnq-ij-modal{display:none;position:fixed;inset:0;z-index:10500;background:rgba(8,12,18,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);align-items:center;justify-content:center;}',
      '#pnq-ij-modal.pnq-ij-open{display:flex;}',

      '#pnq-ij-card{position:relative;width:min(940px,96vw);max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(150deg,#131c2a 0%,#0c1520 100%);border:1px solid rgba(80,160,255,.2);border-radius:16px;box-shadow:0 28px 90px rgba(0,0,0,.7),0 0 0 1px rgba(80,160,255,.06);overflow:hidden;}',

      /* Header */
      '#pnq-ij-header{display:flex;align-items:center;gap:16px;padding:20px 26px 18px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;background:rgba(255,255,255,.02);}',
      '#pnq-ij-header .pnq-ij-icon{width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#2080ff 0%,#0050cc 100%);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;flex-shrink:0;box-shadow:0 4px 16px rgba(32,128,255,.35);}',
      '#pnq-ij-header .pnq-ij-title,#pnq-ij-header h3,#pnq-ij-title{margin:0 !important;padding:0 !important;background:transparent !important;background-color:transparent !important;border:none !important;box-shadow:none !important;font-size:20px !important;font-weight:700 !important;color:#ffffff !important;letter-spacing:.2px;text-transform:none !important;display:block !important;line-height:1.3;}',
      '#pnq-ij-close{margin-left:auto;background:none;border:none;color:#6a8aae;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;line-height:1;transition:color .15s,background .15s;}',
      '#pnq-ij-close:hover{color:#e0eeff;background:rgba(255,255,255,.08);}',

      /* Tabs */
      '#pnq-ij-tabs{display:flex;gap:4px;padding:14px 26px 0;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.15);}',
      '.pnq-ij-tab{padding:9px 18px;border-radius:8px 8px 0 0;border:1px solid transparent;border-bottom:none;font-size:13px;font-weight:600;cursor:pointer;color:#6a8aae;background:transparent;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}',
      '.pnq-ij-tab.active{background:rgba(32,128,255,.12);border-color:rgba(80,160,255,.25);color:#60b0ff;box-shadow:inset 0 2px 0 #3b82f6;}',
      '.pnq-ij-tab:hover:not(.active){color:#b0ccee;background:rgba(255,255,255,.04);}',

      /* Body */
      '#pnq-ij-body{flex:1;overflow-y:auto;padding:20px 26px;display:flex;flex-direction:column;gap:14px;}',
      '#pnq-ij-body::-webkit-scrollbar{width:6px;}',
      '#pnq-ij-body::-webkit-scrollbar-track{background:rgba(0,0,0,.1);}',
      '#pnq-ij-body::-webkit-scrollbar-thumb{background:rgba(80,160,255,.25);border-radius:3px;}',

      /* Panels */
      '.pnq-ij-panel{display:none;flex-direction:column;gap:14px;}',
      '.pnq-ij-panel.active{display:flex;}',

      /* Drop zone */
      '#pnq-ij-dropzone{border:2px dashed rgba(80,160,255,.32);border-radius:10px;padding:16px 20px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(32,128,255,.03);position:relative;display:flex;align-items:center;justify-content:center;min-height:68px;}',
      '#pnq-ij-dropzone:hover{border-color:#50a0ff;background:rgba(32,128,255,.08);}',
      '#pnq-ij-dropzone.drag-over{border-color:#4090ff;background:rgba(32,128,255,.14);transform:scale(1.01);}',
      '#pnq-ij-dropzone .pnq-ij-dz-icon{font-size:38px;color:#5098ea;margin:0;line-height:1;display:flex;align-items:center;justify-content:center;transition:transform .2s,color .2s;}',
      '#pnq-ij-dropzone:hover .pnq-ij-dz-icon{color:#78beff;transform:translateY(-2px);}',
      '#pnq-ij-file-input{display:none;}',

      /* Form rows */
      '.pnq-ij-row{display:flex;flex-direction:column;gap:6px;}',
      '.pnq-ij-label{font-size:11px;font-weight:700;color:#6a8aae;letter-spacing:.6px;text-transform:uppercase;}',
      '.pnq-ij-input{width:100%;box-sizing:border-box;padding:9px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(80,160,255,.14);border-radius:8px;color:#b8d4ee;font-size:13px;outline:none;transition:border-color .15s;}',
      '.pnq-ij-input:focus{border-color:rgba(80,160,255,.4);background:rgba(32,128,255,.06);}',

      /* Textarea */
      '#pnq-ij-textarea{width:100%;box-sizing:border-box;min-height:240px;padding:12px;background:#080e16;border:1px solid rgba(80,160,255,.14);border-radius:8px;color:#8ab8d8;font-size:12px;font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;outline:none;resize:vertical;transition:border-color .15s;line-height:1.55;}',
      '#pnq-ij-textarea:focus{border-color:rgba(80,160,255,.38);}',

      /* Validation box */
      '#pnq-ij-validation{border-radius:8px;padding:12px 16px;font-size:12px;line-height:1.7;display:none;margin-top:4px;margin-bottom:6px;}',
      '#pnq-ij-validation.ok{display:block;background:rgba(0,200,100,.08);border:1px solid rgba(0,200,100,.3);color:#48e094;}',
      '#pnq-ij-validation.err{display:block;background:rgba(255,70,70,.12);border:1px solid rgba(255,70,70,.35);color:#ff9090;}',
      '#pnq-ij-validation.warn{display:block;background:rgba(255,180,0,.08);border:1px solid rgba(255,180,0,.3);color:#f0c040;}',
      '#pnq-ij-validation.info{display:block;background:rgba(32,128,255,.08);border:1px solid rgba(32,128,255,.3);color:#70b0ff;}',

      /* Progress */
      '#pnq-ij-progress{display:none;flex-direction:column;gap:8px;}',
      '#pnq-ij-progress.active{display:flex;}',
      '#pnq-ij-pb-wrap{height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;}',
      '#pnq-ij-pb{height:100%;width:0%;background:linear-gradient(90deg,#2080ff,#60d0ff);border-radius:3px;transition:width .35s ease;}',
      '#pnq-ij-pb-label{display:none;}',

      /* Result */
      '#pnq-ij-result{display:none !important;}',

      /* Export panel */
      '#pnq-ij-export-out{width:100%;box-sizing:border-box;min-height:280px;padding:12px;background:#080e16;border:1px solid rgba(80,160,255,.14);border-radius:8px;color:#8ab8d8;font-size:12px;font-family:"SFMono-Regular",Consolas,monospace;resize:vertical;outline:none;}',
      '#pnq-ij-export-validation{border-radius:8px;padding:10px 14px;font-size:12px;line-height:1.7;display:none;}',
      '#pnq-ij-export-validation.ok{display:block;background:rgba(0,200,100,.07);border:1px solid rgba(0,200,100,.22);color:#48e094;}',
      '#pnq-ij-export-validation.err{display:block;background:rgba(255,70,70,.07);border:1px solid rgba(255,70,70,.22);color:#ff8080;}',

      /* ── Templates Panel Styles ────────────────────────────────────────── */
      '.pnq-ij-tpl-intro{background:linear-gradient(135deg,rgba(32,128,255,.1),rgba(16,36,64,.4));border:1px solid rgba(80,160,255,.25);border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}',
      '.pnq-ij-tpl-intro-text h4{margin:0 0 5px;font-size:14px;color:#e0eeff;font-weight:700;}',
      '.pnq-ij-tpl-intro-text p{margin:0;font-size:12px;color:#789ac0;line-height:1.5;}',
      '.pnq-ij-tpl-intro-actions{display:flex;gap:8px;flex-shrink:0;}',

      '.pnq-ij-nav-pills{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;flex-shrink:0;}',
      '.pnq-ij-pill{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#8ab0d4;transition:all .15s;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;}',
      '.pnq-ij-pill:hover{background:rgba(32,128,255,.15);color:#b8dcff;border-color:rgba(80,160,255,.3);}',
      '.pnq-ij-pill.active{background:linear-gradient(135deg,#2080ff,#0050cc);color:#fff;border-color:transparent;box-shadow:0 2px 10px rgba(32,128,255,.4);}',

      '.pnq-ij-tpl-nodecard{background:rgba(12,20,32,.75);border:1px solid rgba(80,160,255,.16);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:14px;transition:border-color .2s;}',
      '.pnq-ij-tpl-nodecard:hover{border-color:rgba(80,160,255,.32);}',

      '.pnq-ij-nodehdr{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.pnq-ij-nodetitle{display:flex;align-items:center;gap:10px;}',
      '.pnq-ij-nodeico{width:32px;height:32px;border-radius:8px;background:rgba(32,128,255,.15);color:#60b0ff;display:flex;align-items:center;justify-content:center;font-size:15px;}',
      '.pnq-ij-nodename,.pnq-ij-nodetitle h3{margin:0 !important;padding:0 !important;background:transparent !important;background-color:transparent !important;border:none !important;box-shadow:none !important;font-size:16px !important;font-weight:700 !important;color:#ffffff !important;letter-spacing:.3px;text-transform:none !important;display:inline-block !important;line-height:1.3 !important;}',
      '.pnq-ij-badge{display:inline-block;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;}',
      '.pnq-ij-nodedesc{font-size:12px;color:#789ac0;margin:0;line-height:1.5;}',

      /* Section inside nodecard */
      '.pnq-ij-secbox{background:rgba(6,11,18,.6);border:1px solid rgba(80,160,255,.12);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:8px;}',
      '.pnq-ij-sechdr{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.pnq-ij-sectitle{font-size:12px;font-weight:700;color:#60a8ea;display:inline-flex;align-items:center;gap:6px;}',
      '.pnq-ij-sectitle .step-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:rgba(32,128,255,.25);color:#80c8ff;font-size:10px;font-weight:800;}',
      '.pnq-ij-sec-actions{display:flex;gap:6px;}',

      '.pnq-ij-btn-pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#8ab0d4;transition:all .15s;display:inline-flex;align-items:center;gap:5px;outline:none;}',
      '.pnq-ij-btn-pill:hover{background:rgba(32,128,255,.2);color:#c8e2ff;border-color:rgba(80,160,255,.3);}',
      '.pnq-ij-btn-pill.primary{background:linear-gradient(135deg,rgba(32,128,255,.4),rgba(0,80,204,.5));border-color:rgba(80,160,255,.4);color:#fff;}',
      '.pnq-ij-btn-pill.primary:hover{filter:brightness(1.15);}',

      /* Code block */
      '.pnq-ij-codebox{position:relative;background:#05090f;border:1px solid rgba(80,160,255,.1);border-radius:8px;padding:10px 12px;max-height:220px;overflow-y:auto;font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:11.5px;color:#9bc4e2;line-height:1.55;white-space:pre-wrap;word-break:break-all;}',
      '.pnq-ij-codebox::-webkit-scrollbar{width:4px;}',
      '.pnq-ij-codebox::-webkit-scrollbar-thumb{background:rgba(80,160,255,.2);border-radius:2px;}',

      /* Fields table */
      '.pnq-ij-tblwrap{overflow-x:auto;border-radius:6px;border:1px solid rgba(80,160,255,.12);background:rgba(8,16,28,.6);margin-bottom:6px;}',
      '.pnq-ij-fldtbl{width:100%;border-collapse:collapse;font-size:11.5px;color:#8ab0d4;}',
      '.pnq-ij-fldtbl thead{background:#0e1e32;}',
      '.pnq-ij-fldtbl th{text-align:left;padding:8px 10px;background:#0e1e32;color:#60a8ea;font-weight:700;border-bottom:1px solid rgba(80,160,255,.2);position:static;white-space:nowrap;}',
      '.pnq-ij-fldtbl td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04);line-height:1.5;}',
      '.pnq-ij-fldtbl tr:hover td{background:rgba(255,255,255,.03);}',
      '.pnq-ij-tag-req{color:#ff8080;font-weight:700;}',
      '.pnq-ij-tag-opt{color:#5090c0;}',

      /* Footer */
      '#pnq-ij-footer{display:flex;align-items:center;gap:8px;padding:14px 26px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;background:rgba(0,0,0,.1);}',
      '#pnq-ij-footer .pnq-ij-spacer{flex:1;}',
      '.pnq-ij-chips{display:none !important;}',
      '.pnq-ij-btn{display:inline-flex;align-items:center;justify-content:center;gap:0;padding:11px 28px;border-radius:8px;border:none;font-size:15px;font-weight:600;letter-spacing:.3px;cursor:pointer;transition:all .15s ease;outline:none;white-space:nowrap;min-width:104px;text-align:center;}',
      '.pnq-ij-btn-primary{background:linear-gradient(135deg,#2080ff,#0050cc);color:#fff;box-shadow:0 4px 14px rgba(32,128,255,.35);}',
      '.pnq-ij-btn-primary:hover:not(:disabled){filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 6px 18px rgba(32,128,255,.45);}',
      '.pnq-ij-btn-primary:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}',
      '.pnq-ij-btn-secondary{background:rgba(255,255,255,.08);color:#c0d8f0;border:1px solid rgba(255,255,255,.14);}',
      '.pnq-ij-btn-secondary:hover:not(:disabled){background:rgba(255,255,255,.14);color:#ffffff;border-color:rgba(255,255,255,.25);}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── Template Card Builder ───────────────────────────────────────────── */
  function buildNodeCardHtml(key) {
    var item = TEMPLATES_DATA[key];
    if (!item) return '';

    var fieldsRows = item.fields.map(function (f) {
      var reqBadge = f.req
        ? '<span class="pnq-ij-tag-req">Bắt buộc</span>'
        : '<span class="pnq-ij-tag-opt">Tùy chọn</span>';
      return '<tr>' +
        '<td><code style="color:#60b0ff;font-weight:600;">' + esc(f.name) + '</code></td>' +
        '<td>' + reqBadge + '</td>' +
        '<td><span style="color:#a070e0;">' + esc(f.type) + '</span></td>' +
        '<td>' + esc(f.desc) + '</td>' +
        '</tr>';
    }).join('');

    var schemaJson = JSON.stringify(item.schema, null, 2);
    var exampleJson = JSON.stringify(item.example, null, 2);
    var tplTitle = 'Template ' + (item.id === 'iol' ? 'IOL' : item.name);

    return [
      '<div class="pnq-ij-tpl-nodecard" data-node-type="' + item.id + '"' + (item.id === 'iol' ? '' : ' style="display:none;"') + '>',

      /* Card Header */
      '  <div class="pnq-ij-nodehdr">',
      '    <div class="pnq-ij-nodetitle">',
      '      <div class="pnq-ij-nodeico"><i class="fa ' + item.icon + '"></i></div>',
      '      <span class="pnq-ij-nodename">' + esc(item.name) + '</span>',
      '    </div>',
      '    <div class="pnq-ij-sec-actions">',
      '      <button class="pnq-ij-btn-pill primary action-dl-node" data-key="' + item.id + '" title="Tải file template .json của loại này"><i class="fa fa-download"></i> Download template</button>',
      '      <button class="pnq-ij-btn-pill action-use-node" data-key="' + item.id + '" title="Chèn ví dụ này vào khung Import"><i class="fa fa-rocket"></i> Import</button>',
      '    </div>',
      '  </div>',

      /* 1. Form Template */
      '  <div class="pnq-ij-secbox">',
      '    <div class="pnq-ij-sechdr">',
      '      <span class="pnq-ij-sectitle"><span class="step-num">1</span>&nbsp; ' + esc(tplTitle) + '</span>',
      '      <div class="pnq-ij-sec-actions">',
      '        <button class="pnq-ij-btn-pill action-copy-schema" data-key="' + item.id + '"><i class="fa fa-copy"></i> Copy Form</button>',
      '      </div>',
      '    </div>',
      '    <div class="pnq-ij-tblwrap">',
      '      <table class="pnq-ij-fldtbl">',
      '        <thead><tr><th>Tên trường</th><th>Yêu cầu</th><th>Kiểu</th><th>Ý nghĩa & Hướng dẫn khai báo</th></tr></thead>',
      '        <tbody>' + fieldsRows + '</tbody>',
      '      </table>',
      '    </div>',
      '    <div class="pnq-ij-codebox" id="pnq-code-schema-' + item.id + '">' + esc(schemaJson) + '</div>',
      '  </div>',

      /* 2. Ví dụ Cụ Thể (Concrete Example) */
      '  <div class="pnq-ij-secbox" style="background:rgba(0,180,100,.04);border-color:rgba(0,200,100,.2);">',
      '    <div class="pnq-ij-sechdr">',
      '      <span class="pnq-ij-sectitle" style="color:#48e094;"><span class="step-num" style="background:rgba(0,200,100,.25);color:#48e094;">2</span>&nbsp; Example</span>',
      '      <div class="pnq-ij-sec-actions">',
      '        <button class="pnq-ij-btn-pill action-copy-example" data-key="' + item.id + '"><i class="fa fa-copy"></i> Copy Example</button>',
      '        <button class="pnq-ij-btn-pill primary action-use-node" data-key="' + item.id + '"><i class="fa fa-rocket"></i> Use Example</button>',
      '      </div>',
      '    </div>',
      '    <div class="pnq-ij-codebox" id="pnq-code-example-' + item.id + '">' + esc(exampleJson) + '</div>',
      '  </div>',

      '</div>'
    ].join('\n');
  }

  /* ── HTML ────────────────────────────────────────────────────────────── */
  function buildModal() {
    var existing = document.getElementById('pnq-ij-modal');
    if (existing) return existing;

    var modalEl = document.createElement('div');
    modalEl.id = 'pnq-ij-modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('aria-labelledby', 'pnq-ij-title');
    modalEl.innerHTML = [
      '<div id="pnq-ij-card">',

      /* header */
      '<div id="pnq-ij-header">',
      '  <div class="pnq-ij-icon"><i class="fa fa-sitemap"></i></div>',
      '  <div id="pnq-ij-title" class="pnq-ij-title">Import / Export JSON Topology</div>',
      '  <button id="pnq-ij-close" title="Close" aria-label="Close">&#x2715;</button>',
      '</div>',

      /* tabs */
      '<div id="pnq-ij-tabs">',
      '  <button class="pnq-ij-tab active" data-panel="import"><i class="fa fa-upload"></i>&nbsp; Import JSON</button>',
      '  <button class="pnq-ij-tab" data-panel="export"><i class="fa fa-download"></i>&nbsp; Export → JSON</button>',
      '  <button class="pnq-ij-tab" data-panel="templates"><i class="fa fa-book"></i>&nbsp; Template</button>',
      '</div>',

      /* body */
      '<div id="pnq-ij-body">',

      /* ── IMPORT panel ── */
      '<div class="pnq-ij-panel active" id="pnq-ij-panel-import">',

      '  <div id="pnq-ij-dropzone" tabindex="0" role="button" aria-label="Drop JSON file or click to browse">',
      '    <div class="pnq-ij-dz-icon"><i class="fa fa-cloud-upload"></i></div>',
      '    <input type="file" id="pnq-ij-file-input" accept=".json,application/json">',
      '  </div>',

      '  <div id="pnq-ij-validation"></div>',

      '  <div class="pnq-ij-row">',
      '    <label class="pnq-ij-label" for="pnq-ij-textarea"><i class="fa fa-code"></i>&nbsp; JSON Topology</label>',
      '    <textarea id="pnq-ij-textarea" spellcheck="false" placeholder=""></textarea>',
      '  </div>',

      '  <div id="pnq-ij-progress">',
      '    <div id="pnq-ij-pb-wrap"><div id="pnq-ij-pb"></div></div>',
      '  </div>',

      '</div>', /* /import panel */

      /* ── EXPORT panel ── */
      '<div class="pnq-ij-panel" id="pnq-ij-panel-export">',

      '  <div id="pnq-ij-export-validation"></div>',

      '  <div class="pnq-ij-row">',
      '    <label class="pnq-ij-label" for="pnq-ij-export-out"><i class="fa fa-code"></i>&nbsp; JSON Output</label>',
      '    <textarea id="pnq-ij-export-out" readonly placeholder=""></textarea>',
      '  </div>',

      '</div>', /* /export panel */

      /* ── TEMPLATES panel ── */
      '<div class="pnq-ij-panel" id="pnq-ij-panel-templates">',


      /* Filter pills */
      '  <div class="pnq-ij-nav-pills">',
      '    <button class="pnq-ij-pill active" data-filter="iol"><i class="fa fa-server"></i> Cisco IOL</button>',
      '    <button class="pnq-ij-pill" data-filter="vpcs"><i class="fa fa-terminal"></i> VPCS</button>',
      '    <button class="pnq-ij-pill" data-filter="qemu"><i class="fa fa-desktop"></i> QEMU / KVM</button>',
      '    <button class="pnq-ij-pill" data-filter="docker"><i class="fa fa-cube"></i> Docker</button>',
      '  </div>',

      /* Node sections: IOL -> VPCS -> QEMU -> Docker */
      buildNodeCardHtml('iol'),
      buildNodeCardHtml('vpcs'),
      buildNodeCardHtml('qemu'),
      buildNodeCardHtml('docker'),

      '</div>', /* /templates panel */

      '</div>', /* /body */

      /* footer */
      '<div id="pnq-ij-footer">',
      '  <button class="pnq-ij-btn pnq-ij-btn-secondary" id="pnq-ij-btn-clear">Clear</button>',
      '  <span class="pnq-ij-spacer"></span>',
      '  <div class="pnq-ij-chips" id="pnq-ij-chips" style="display:none;"></div>',
      '  <button class="pnq-ij-btn pnq-ij-btn-primary" id="pnq-ij-btn-import" disabled>Import</button>',
      '  <button class="pnq-ij-btn pnq-ij-btn-secondary" id="pnq-ij-btn-export" style="display:none;">Export</button>',
      '  <button class="pnq-ij-btn pnq-ij-btn-secondary" id="pnq-ij-btn-copy" style="display:none;">Copy JSON</button>',
      '</div>',

      '</div>', /* /card */
    ].join('\n');

    document.body.appendChild(modalEl);
    return modalEl;
  }

  /* ── State ───────────────────────────────────────────────────────────── */
  var modal = null;
  var currentPanel = 'import';
  var parsedJson = null;
  var importing = false;

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function esc(t) {
    return String(t == null ? '' : t).replace(/[<>&"]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  function setVal(boxId, type, html) {
    var b = el(boxId); if (!b) return;
    b.className = type; b.innerHTML = html;
  }

  function setProgress(on, pct, lbl) {
    var p = el('pnq-ij-progress'), b = el('pnq-ij-pb'), l = el('pnq-ij-pb-label');
    if (!p) return;
    on ? p.classList.add('active') : p.classList.remove('active');
    if (b) b.style.width = (pct || 0) + '%';
    if (l && lbl) l.textContent = lbl;
  }

  function updateChips(json, missingList) {
    var c = el('pnq-ij-chips'); if (!c) return;
    c.innerHTML = '';
    if (!json) return;
    var t = json.topology || json;
    [
      ['fa-cube', (t.nodes || []).length + ' nodes'],
      ['fa-link', (t.links || []).length + ' links'],
      ['fa-cloud', (t.cloud_networks || []).length + ' clouds'],
    ].forEach(function (x) {
      var s = document.createElement('span');
      s.className = 'pnq-ij-chip';
      s.innerHTML = '<i class="fa ' + x[0] + '"></i>&nbsp;' + esc(x[1]);
      c.appendChild(s);
    });
    if (missingList && missingList.length) {
      var errChip = document.createElement('span');
      errChip.className = 'pnq-ij-chip';
      errChip.style.background = 'rgba(255,70,70,.18)';
      errChip.style.color = '#ff8080';
      errChip.style.borderColor = 'rgba(255,70,70,.35)';
      var uniqueCount = Array.from(new Set(missingList.map(function (m) { return m.image; }))).length;
      errChip.innerHTML = '<i class="fa fa-exclamation-triangle"></i>&nbsp;Thiếu ' + uniqueCount + ' image (' + missingList.length + ' nodes)';
      c.appendChild(errChip);
    }
  }

  /* ── Download Helper ─────────────────────────────────────────────────── */
  function downloadJsonFile(filename, data) {
    var str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    var blob = new Blob([str], { type: 'application/json;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof addMessage === 'function') {
      addMessage('success', 'Đã tải xuống file ' + filename);
    }
  }

  /* ── Load to Editor Helper ───────────────────────────────────────────── */
  function loadIntoEditor(data) {
    var ta = el('pnq-ij-textarea');
    if (ta) {
      ta.value = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      switchTab('import');
      onTextInput();
      ta.scrollTop = 0;
      if (typeof addMessage === 'function') {
        addMessage('info', 'Đã chèn mẫu vào khung Import. Nhấn "Import" để thêm vào sơ đồ.');
      }
    }
  }

  /* ── Copy to Clipboard ───────────────────────────────────────────────── */
  function copyText(text, label) {
    if (!text) return;
    var str = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(function () {
        if (typeof addMessage === 'function') {
          addMessage('info', 'Đã sao chép ' + (label || 'JSON') + ' vào clipboard.');
        }
      }).catch(function () {
        fallbackCopy(str, label);
      });
    } else {
      fallbackCopy(str, label);
    }
  }

  function fallbackCopy(str, label) {
    var ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (typeof addMessage === 'function') {
        addMessage('info', 'Đã sao chép ' + (label || 'JSON') + ' vào clipboard.');
      }
    } catch (_) { }
    document.body.removeChild(ta);
  }

  /* ── Client-side validation ──────────────────────────────────────────── */
  function clientValidate(json) {
    var errs = [], t = json.topology || json;
    if (!Array.isArray(t.nodes) || !t.nodes.length) {
      errs.push('Cần ít nhất 1 node trong danh sách <b>nodes[]</b>');
    }
    (t.nodes || []).forEach(function (n, i) {
      if (!n.name) errs.push('nodes[' + i + ']: thiếu <b>name</b>');
      if (!n.type) errs.push('nodes[' + i + ']: thiếu <b>type</b> (iol/qemu/vpcs/docker)');
      if (!n.template) errs.push('nodes[' + i + ']: thiếu <b>template</b>');
    });
    return errs;
  }

  /* ── Live textarea ───────────────────────────────────────────────────── */
  var parseTimer = null;
  function onTextInput() {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(function () {
      var text = (el('pnq-ij-textarea') || {}).value;
      if (!text || !text.trim()) {
        parsedJson = null;
        setVal('pnq-ij-validation', '', '');
        if (el('pnq-ij-btn-import')) {
          el('pnq-ij-btn-import').disabled = true;
          el('pnq-ij-btn-import').innerHTML = 'Import';
          el('pnq-ij-btn-import').title = '';
          el('pnq-ij-btn-import').onclick = doImport;
        }
        updateChips(null);
        return;
      }
      var json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        parsedJson = null;
        setVal('pnq-ij-validation', 'err', '<i class="fa fa-times-circle"></i>&nbsp; Lỗi cú pháp JSON — vui lòng kiểm tra dấu phẩy hoặc ngoặc.');
        if (el('pnq-ij-btn-import')) {
          el('pnq-ij-btn-import').disabled = true;
          el('pnq-ij-btn-import').innerHTML = 'Import';
        }
        updateChips(null);
        return;
      }
      var topo = json.topology || json;
      parsedJson = json;
      updateChips(json);
      var errs = clientValidate(json);
      if (errs.length) {
        setVal('pnq-ij-validation', 'warn',
          '<i class="fa fa-exclamation-triangle"></i>&nbsp;<b>Lưu ý cấu trúc:</b><ul style="margin:5px 0 0 16px;padding:0">' +
          errs.map(function (e) { return '<li>' + e + '</li>'; }).join('') + '</ul>');
        if (el('pnq-ij-btn-import')) {
          el('pnq-ij-btn-import').disabled = true;
          el('pnq-ij-btn-import').innerHTML = 'Import';
        }
        return;
      }

      // Check image availability on server
      setVal('pnq-ij-validation', 'info', '<i class="fa fa-spinner fa-spin"></i>&nbsp; Đang kiểm tra images trên máy chủ…');
      if (el('pnq-ij-btn-import')) {
        el('pnq-ij-btn-import').disabled = true;
        el('pnq-ij-btn-import').innerHTML = 'Import';
      }

      var checkXhr = new XMLHttpRequest();
      checkXhr.open('POST', '/api/labs/session/topology_json/check_images', true);
      checkXhr.setRequestHeader('Content-Type', 'application/json');
      checkXhr.withCredentials = true;
      checkXhr.onload = function () {
        if (checkXhr.status >= 200 && checkXhr.status < 300) {
          var chkRes;
          try { chkRes = JSON.parse(checkXhr.responseText); } catch (_) { chkRes = {}; }
          var chkData = chkRes.data || {};
          var missing = chkData.missing || [];
          if (missing.length) {
            updateChips(json, missing);
            var missingImages = Array.from(new Set(missing.map(function (m) { return m.image; }))).join(', ');
            var msg = 'Image ' + missingImages + ' hiện chưa có sẵn vui lòng tải hoặc thêm vào';
            var detail = '<ul style="margin:5px 0 0 16px;padding:0">' +
              missing.map(function (m) {
                return '<li>Node <b>' + esc(m.node || '') + '</b>: image <code>' + esc(m.image || '') + '</code> (' + esc(m.type || '') + ')</li>';
              }).join('') + '</ul>' +
              '<div style="margin-top:6px;font-size:11.5px;color:#cbd5e1;">(Mẹo: Bạn có thể vào menu <b>System -> Get Image</b> trên PNetLab để tải từ kho 473 Image có sẵn)</div>';
            setVal('pnq-ij-validation', 'err',
              '<i class="fa fa-times-circle"></i>&nbsp;<b>' + esc(msg) + '</b>' + detail);
            if (el('pnq-ij-btn-import')) {
              el('pnq-ij-btn-import').disabled = true;
              el('pnq-ij-btn-import').innerHTML = 'Import';
              el('pnq-ij-btn-import').title = msg;
            }
            return;
          }
        }
        // Tất cả images đều sẵn sàng
        updateChips(json);
        setVal('pnq-ij-validation', 'ok',
          '<i class="fa fa-check-circle"></i>&nbsp; Cấu trúc và tất cả images đã sẵn sàng — nhấn <b>Import</b> để thêm vào canvas.');
        if (el('pnq-ij-btn-import')) {
          el('pnq-ij-btn-import').disabled = false;
          el('pnq-ij-btn-import').innerHTML = 'Import';
          el('pnq-ij-btn-import').title = '';
          el('pnq-ij-btn-import').onclick = doImport;
        }
      };
      checkXhr.onerror = function () {
        updateChips(json);
        setVal('pnq-ij-validation', 'ok',
          '<i class="fa fa-check-circle"></i>&nbsp; JSON hợp lệ — nhấn <b>Import</b> để thêm vào canvas.');
        if (el('pnq-ij-btn-import')) {
          el('pnq-ij-btn-import').disabled = false;
          el('pnq-ij-btn-import').innerHTML = 'Import';
          el('pnq-ij-btn-import').title = '';
          el('pnq-ij-btn-import').onclick = doImport;
        }
      };
      checkXhr.send(JSON.stringify({ topology: topo }));
    }, 280);
  }

  /* ── File load ───────────────────────────────────────────────────────── */
  function loadFile(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function (e) {
      var ta = el('pnq-ij-textarea');
      if (ta) { ta.value = e.target.result; onTextInput(); }
    };
    r.readAsText(file);
  }

  /* ── Import (POST into current session) ──────────────────────────────── */
  function doImport() {
    if (!parsedJson || importing) return;
    importing = true;

    var topology = parsedJson.topology || parsedJson;

    if (el('pnq-ij-btn-import')) el('pnq-ij-btn-import').disabled = true;
    if (el('pnq-ij-result')) el('pnq-ij-result').classList.remove('active');
    setVal('pnq-ij-validation', '', '');
    setProgress(true, 15, '');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/labs/session/topology_json/import', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.withCredentials = true;

    xhr.upload.onprogress = function () {
      setProgress(true, 60, 'Đang tạo nodes, networks & kết nối links…');
    };

    xhr.onload = function () {
      importing = false;
      setProgress(true, 100, 'Hoàn tất!');

      var res;
      try { res = JSON.parse(xhr.responseText); } catch (e) { res = {}; }

      if (xhr.status >= 200 && xhr.status < 300 && res.status === 'success') {
        var d = res.data || {};
        setVal('pnq-ij-validation', 'ok',
          '<i class="fa fa-check-circle"></i>&nbsp; <b>' + esc(res.message || 'Import successful!') + '</b>');

        var tbody = el('pnq-ij-result-body');
        if (tbody) tbody.innerHTML = [
          ['Nodes đã thêm', d.nodes || '0'],
          ['Links', d.links || '0'],
          ['Cloud networks', d.clouds || '0'],
        ].map(function (r) {
          return '<tr><td>' + esc(r[0]) + '</td><td><b>' + esc(String(r[1])) + '</b></td></tr>';
        }).join('');
        if (el('pnq-ij-result')) el('pnq-ij-result').classList.add('active');

        // 1. Cập nhật window.PNQStore nếu có
        if (res.update && typeof window !== 'undefined' && window.PNQStore && typeof window.PNQStore.set === 'function') {
          try {
            if (res.update.nodes) window.PNQStore.set('nodes', res.update.nodes);
            if (res.update.networks) window.PNQStore.set('networks', res.update.networks);
          } catch (_) { }
        }

        // 2. Kích hoạt App.topology re-fetch & redraw
        if (typeof window !== 'undefined' && window.App && window.App.topology) {
          if (res.update && typeof window.App.topology.updateData === 'function') {
            try { window.App.topology.updateData(res.update); } catch (_) { }
          }
          if (typeof window.App.topology.getTopoData === 'function') {
            try {
              window.App.topology.getTopoData().then(function () {
                if (typeof window.App.topology.printTopology === 'function') {
                  window.App.topology.printTopology();
                }
              });
            } catch (_) { }
          } else if (typeof window.App.topology.printTopology === 'function') {
            try { window.App.topology.printTopology(); } catch (_) { }
          }
        }

        // 3. Dispatch native event cho Svelte Flow island
        try {
          document.dispatchEvent(new CustomEvent('pnq:app-updatedata', {
            detail: { update: res.update || {} }
          }));
        } catch (_) { }

        if (typeof addMessage === 'function') {
          addMessage('success', res.message || 'JSON topology imported successfully.');
        }

        // 4. Cho phép đóng modal hoặc tự động đóng sau 1.5s để xem canvas
        if (el('pnq-ij-btn-import')) {
          el('pnq-ij-btn-import').disabled = false;
          el('pnq-ij-btn-import').innerHTML = 'Import';
          el('pnq-ij-btn-import').onclick = closeModal;
        }

        setTimeout(function () {
          closeModal();
          // Redraw canvas lần nữa sau khi modal ẩn
          if (window.App && window.App.topology && typeof window.App.topology.printTopology === 'function') {
            try { window.App.topology.printTopology(); } catch (_) { }
          }
        }, 1500);

      } else {
        setProgress(false, 0, '');
        var msg = res.message || 'Import failed!';
        var detail = '';
        if (res.data && res.data.missing_images && res.data.missing_images.length) {
          detail = '<ul style="margin:5px 0 0 16px;padding:0">' +
            res.data.missing_images.map(function (m) {
              return '<li>Node <b>' + esc(m.node || '') + '</b>: image <code>' + esc(m.image || '') + '</code> (' + esc(m.type || '') + ')</li>';
            }).join('') + '</ul>' +
            '<div style="margin-top:6px;font-size:11.5px;color:#cbd5e1;">(Mẹo: Bạn có thể vào menu <b>System -> Get Image</b> trên PNetLab để tải từ kho 473 Image có sẵn)</div>';
        } else if (res.data && res.data.errors) {
          detail = '<ul style="margin:5px 0 0 16px;padding:0">' +
            res.data.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
        }
        setVal('pnq-ij-validation', 'err',
          '<i class="fa fa-times-circle"></i>&nbsp;<b>' + esc(msg) + '</b>' + detail);
        if (el('pnq-ij-btn-import')) el('pnq-ij-btn-import').disabled = true;
      }
    };

    xhr.onerror = function () {
      importing = false;
      setProgress(false, 0, '');
      setVal('pnq-ij-validation', 'err', '<i class="fa fa-times-circle"></i>&nbsp; Lỗi mạng — không kết nối được server.');
      if (el('pnq-ij-btn-import')) el('pnq-ij-btn-import').disabled = false;
    };

    xhr.send(JSON.stringify({ topology: topology }));
  }

  /* ── Export ──────────────────────────────────────────────────────────── */
  function doExport() {
    var out = el('pnq-ij-export-out');
    var vbox = el('pnq-ij-export-validation');
    if (out) out.value = 'Đang tải thông tin lab…';
    if (vbox) { vbox.className = ''; vbox.innerHTML = ''; }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/labs/session/topology_json/export', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.withCredentials = true;
    xhr.onload = function () {
      var res; try { res = JSON.parse(xhr.responseText); } catch (e) { res = {}; }
      if (xhr.status === 200 && res.status === 'success') {
        if (out) out.value = JSON.stringify(res.data, null, 2);
        if (vbox) { vbox.className = 'ok'; vbox.innerHTML = '<i class="fa fa-check-circle"></i>&nbsp; Export successful.'; }
        if (el('pnq-ij-btn-copy')) el('pnq-ij-btn-copy').style.display = '';
      } else {
        if (out) out.value = '';
        if (vbox) { vbox.className = 'err'; vbox.innerHTML = '<i class="fa fa-times-circle"></i>&nbsp; ' + esc((res.message) || 'Export failed.'); }
      }
    };
    xhr.onerror = function () {
      if (out) out.value = '';
      if (vbox) { vbox.className = 'err'; vbox.innerHTML = '<i class="fa fa-times-circle"></i>&nbsp; Network error.'; }
    };
    xhr.send('{}');
  }

  /* ── Tab switch ──────────────────────────────────────────────────────── */
  function switchTab(panel) {
    currentPanel = panel;
    document.querySelectorAll('.pnq-ij-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.panel === panel);
    });
    document.querySelectorAll('.pnq-ij-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'pnq-ij-panel-' + panel);
    });

    var imp = (panel === 'import');
    var exp = (panel === 'export');
    var tpl = (panel === 'templates');

    if (el('pnq-ij-footer')) el('pnq-ij-footer').style.display = tpl ? 'none' : 'flex';
    if (el('pnq-ij-btn-import')) el('pnq-ij-btn-import').style.display = imp ? '' : 'none';
    if (el('pnq-ij-btn-export')) el('pnq-ij-btn-export').style.display = exp ? '' : 'none';
    if (el('pnq-ij-btn-copy')) el('pnq-ij-btn-copy').style.display = exp ? '' : 'none';
    if (el('pnq-ij-btn-clear')) el('pnq-ij-btn-clear').style.display = tpl ? 'none' : '';

  }

  /* ── Clear ───────────────────────────────────────────────────────────── */
  function doClear() {
    if (currentPanel === 'import') {
      var ta = el('pnq-ij-textarea'); if (ta) ta.value = '';
      parsedJson = null;
      setVal('pnq-ij-validation', '', '');
      if (el('pnq-ij-result')) el('pnq-ij-result').classList.remove('active');
      setProgress(false, 0, '');
      updateChips(null);
      if (el('pnq-ij-btn-import')) {
        el('pnq-ij-btn-import').disabled = true;
        el('pnq-ij-btn-import').innerHTML = 'Import';
        el('pnq-ij-btn-import').onclick = doImport;
      }
    } else if (currentPanel === 'export') {
      var out = el('pnq-ij-export-out'); if (out) out.value = '';
      setVal('pnq-ij-export-validation', '', '');
      if (el('pnq-ij-btn-copy')) el('pnq-ij-btn-copy').style.display = 'none';
    }
  }

  /* ── Wire events ─────────────────────────────────────────────────────── */
  function wireEvents() {
    var cBtn = el('pnq-ij-close');
    if (cBtn) cBtn.addEventListener('click', closeModal);

    var mEl = el('pnq-ij-modal');
    if (mEl) {
      mEl.addEventListener('click', function (e) {
        if (e.target === mEl) closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('pnq-ij-open')) closeModal();
    });

    document.querySelectorAll('.pnq-ij-tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.panel); });
    });

    var ta = el('pnq-ij-textarea');
    if (ta) ta.addEventListener('input', onTextInput);

    var dz = el('pnq-ij-dropzone');
    if (dz) {
      dz.addEventListener('click', function () { var fi = el('pnq-ij-file-input'); if (fi) fi.click(); });
      dz.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var fi = el('pnq-ij-file-input'); if (fi) fi.click();
        }
      });
      dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', function () { dz.classList.remove('drag-over'); });
      dz.addEventListener('drop', function (e) {
        e.preventDefault(); dz.classList.remove('drag-over');
        if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
      });
    }
    var fi = el('pnq-ij-file-input');
    if (fi) fi.addEventListener('change', function () { if (this.files.length) { loadFile(this.files[0]); this.value = ''; } });

    var btnI = el('pnq-ij-btn-import'); if (btnI) btnI.addEventListener('click', doImport);
    var btnE = el('pnq-ij-btn-export'); if (btnE) btnE.addEventListener('click', doExport);
    var btnCl = el('pnq-ij-btn-clear'); if (btnCl) btnCl.addEventListener('click', doClear);
    var btnCp = el('pnq-ij-btn-copy');
    if (btnCp) btnCp.addEventListener('click', function () {
      var out = el('pnq-ij-export-out');
      if (out && out.value) copyText(out.value, 'JSON xuất');
    });

    /* Templates Actions */
    var dlAll = el('pnq-ij-btn-dl-all');
    var dlFooter = el('pnq-ij-footer-dl-full');
    var triggerDownloadMaster = function () {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/themes/default/templates_json/pnetlab_full_topology_template.json', true);
      xhr.onload = function () {
        if (xhr.status === 200 && xhr.responseText) {
          downloadJsonFile('pnetlab_full_topology_template.json', xhr.responseText);
        } else {
          var fallbackData = {
            "node_types": TEMPLATES_DATA,
            "ready_to_import_topology": READY_SAMPLE_TOPOLOGY
          };
          downloadJsonFile('pnetlab_full_topology_template.json', fallbackData);
        }
      };
      xhr.onerror = function () {
        var fallbackData = {
          "node_types": TEMPLATES_DATA,
          "ready_to_import_topology": READY_SAMPLE_TOPOLOGY
        };
        downloadJsonFile('pnetlab_full_topology_template.json', fallbackData);
      };
      xhr.send();
    };

    if (dlAll) dlAll.addEventListener('click', triggerDownloadMaster);
    if (dlFooter) dlFooter.addEventListener('click', triggerDownloadMaster);

    var useAll = el('pnq-ij-btn-use-all');
    var useFooter = el('pnq-ij-footer-use-sample');
    var triggerUseSample = function () {
      loadIntoEditor(READY_SAMPLE_TOPOLOGY);
    };
    if (useAll) useAll.addEventListener('click', triggerUseSample);
    if (useFooter) useFooter.addEventListener('click', triggerUseSample);

    // Filter pills
    document.querySelectorAll('.pnq-ij-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        document.querySelectorAll('.pnq-ij-pill').forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var filter = pill.dataset.filter;
        document.querySelectorAll('.pnq-ij-tpl-nodecard').forEach(function (card) {
          if (filter === 'all' || card.dataset.nodeType === filter) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    // Delegated actions for templates panel
    var panelTpl = el('pnq-ij-panel-templates');
    if (panelTpl) {
      panelTpl.addEventListener('click', function (e) {
        var btnDl = e.target.closest('.action-dl-node');
        if (btnDl) {
          e.preventDefault();
          var k = btnDl.dataset.key;
          var item = TEMPLATES_DATA[k];
          if (item) {
            var fullNodeDoc = {
              "_loai_node": item.name + " (" + item.badge + ")",
              "_thu_muc_image": item.imageDir,
              "template_chuan_day_du_moi_truong": item.schema,
              "mo_ta_chi_tiet_cac_truong": item.fields,
              "vi_du_cu_the": item.example
            };
            downloadJsonFile(item.filename, fullNodeDoc);
          }
          return;
        }

        var btnUse = e.target.closest('.action-use-node');
        if (btnUse) {
          e.preventDefault();
          var k = btnUse.dataset.key;
          var item = TEMPLATES_DATA[k];
          if (item && item.example) {
            loadIntoEditor(item.example);
          }
          return;
        }

        var btnCpSchema = e.target.closest('.action-copy-schema');
        if (btnCpSchema) {
          e.preventDefault();
          var k = btnCpSchema.dataset.key;
          var item = TEMPLATES_DATA[k];
          if (item && item.schema) {
            copyText(item.schema, 'Form Template chuẩn ' + item.name);
          }
          return;
        }

        var btnCpEx = e.target.closest('.action-copy-example');
        if (btnCpEx) {
          e.preventDefault();
          var k = btnCpEx.dataset.key;
          var item = TEMPLATES_DATA[k];
          if (item && item.example) {
            copyText(item.example, 'Ví dụ mẫu ' + item.name);
          }
          return;
        }
      });
    }
  }

  /* ── Open / close ────────────────────────────────────────────────────── */
  function openModal() {
    if (!modal) {
      modal = buildModal();
      wireEvents();
    }
    modal.classList.add('pnq-ij-open');
    switchTab('import');
    setTimeout(function () {
      var ta = el('pnq-ij-textarea');
      if (ta) ta.focus();
    }, 100);
  }
  function closeModal() {
    if (modal) modal.classList.remove('pnq-ij-open');
  }

  window.pnqOpenImportJson = openModal;

  /* ── Delegated click handler ─────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.action-import-json, #pnq-importjson a') : null;
    if (a) {
      e.preventDefault();
      ensureStyle();
      openModal();
    }
  });

  /* ── Sidebar entry injection ─────────────────────────────────────────── */
  function injectSidebar() {
    if (document.getElementById('pnq-importjson')) return true;
    var ul = document.querySelector('#lab-sidebar ul');
    if (!ul) return false;

    var li = document.createElement('li');
    li.id = 'pnq-importjson';
    li.innerHTML = '<a class="action-import-json" href="javascript:void(0)" title="Import JSON topology vào lab đang mở">' +
      '<i class="fa fa-sitemap" style="font-size:14px;"></i>' +
      '<span class="lab-sidebar-title">Import JSON Topology</span></a>';

    var anchor = document.getElementById('action_change_console') || document.getElementById('pnq-aibuilder') || document.getElementById('action-labclose');
    if (anchor && anchor.parentNode === ul) {
      ul.insertBefore(li, anchor);
    } else {
      ul.appendChild(li);
    }
    return true;
  }

  function init() {
    ensureStyle();
    injectSidebar();

    // Quan sát liên tục để tự động gắn lại nút nếu sidebar được vẽ lại (ví dụ sau printPageLabOpen)
    var mo = new MutationObserver(function () {
      if (!document.getElementById('pnq-importjson')) {
        injectSidebar();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
