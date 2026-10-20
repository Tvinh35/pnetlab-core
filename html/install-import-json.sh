#!/bin/bash
# ==============================================================================
# PNetLab v8 — Auto Installer: Import JSON Topology Feature
# ==============================================================================
set -e

echo "======================================================================"
echo "  PNETLAB v8 — CÀI ĐẶT TỰ ĐỘNG TÍNH NĂNG IMPORT JSON TOPOLOGY"
echo "======================================================================"

if [ "$EUID" -ne 0 ]; then
  echo "[!] Vui lòng chạy script này với quyền root (sudo su hoặc sudo bash ...)"
  exit 1
fi

PNET_DIR="/opt/unetlab/html"

if [ ! -d "$PNET_DIR" ]; then
  echo "[!] Không tìm thấy thư mục $PNET_DIR. Hãy chắc chắn đây là máy chủ PNetLab."
  exit 1
fi

# 1. Sao lưu các file trước khi sửa đổi
echo "[1/5] Đang sao lưu các file gốc..."
BACKUP_DIR="/opt/unetlab/html/backup_import_json_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$PNET_DIR/api.php" "$BACKUP_DIR/" 2>/dev/null || true
cp "$PNET_DIR/themes/default/index.html" "$BACKUP_DIR/" 2>/dev/null || true
cp "$PNET_DIR/themes/default/js/functions/status/render.js" "$BACKUP_DIR/" 2>/dev/null || true
cp "$PNET_DIR/themes/default/js/actions.js" "$BACKUP_DIR/" 2>/dev/null || true
echo "    -> Đã sao lưu vào $BACKUP_DIR"

# 2. Kiểm tra 2 file chính
echo "[2/5] Đang kiểm tra 2 file thành phần chính..."
if [ ! -f "$PNET_DIR/includes/api_import_json.php" ]; then
  echo "    [!] Thiếu file $PNET_DIR/includes/api_import_json.php, vui lòng copy file này sang trước."
fi
if [ ! -f "$PNET_DIR/themes/default/js/pnetlab-import-json.js" ]; then
  echo "    [!] Thiếu file $PNET_DIR/themes/default/js/pnetlab-import-json.js, vui lòng copy file này sang trước."
fi

# 3. Chèn Route vào api.php nếu chưa có
echo "[3/5] Đang cấu hình API trong api.php..."
python3 - << 'EOF'
import re, sys

api_file = "/opt/unetlab/html/api.php"
with open(api_file, "r", encoding="utf-8") as f:
    content = f.read()

if 'case "topology_json":' in content:
    print("    -> Route topology_json đã tồn tại trong api.php, bỏ qua.")
else:
    # Tìm vị trí sau case "sdwan": ... break;
    pattern = r'(case\s+"sdwan":.*?break;)'
    match = re.search(pattern, content, re.DOTALL)
    
    code_to_insert = '''

            // ── Import JSON topology into the CURRENTLY OPEN lab ─────────────
            case "topology_json":
                if ($action === "import") {
                    require_once BASE_DIR . "/html/includes/api_import_json.php";
                    checkLabPermission($lab, USER_PER_EDIT_LAB);
                    checkLockLab($lab);

                    $topology = isset($variables["topology"]) && is_array($variables["topology"])
                        ? $variables["topology"]
                        : $variables;

                    // Validate (không bắt buộc có lab.name khi import vào lab đang mở)
                    $valErrors = validateTopologyJson($topology, false);
                    if (!empty($valErrors)) {
                        throw new Exception(implode("; ", $valErrors));
                    }

                    // Check images available
                    $imageCheck = checkImagesAvailable($topology["nodes"]);
                    if (!empty($imageCheck["missing"])) {
                        $missingNames = array_unique(array_map(function($m) {
                            return $m["image"];
                        }, $imageCheck["missing"]));
                        $imgList = implode(", ", $missingNames);
                        throw new ResponseException(
                            "Image $imgList hiện chưa có sẵn vui lòng tải hoặc thêm vào",
                            [
                                "missing_images" => $imageCheck["missing"],
                                "available_images" => $imageCheck["available"],
                            ]
                        );
                    }

                    autoLayoutNodes($topology["nodes"]);

                    $nodeNameToIdx = [];
                    foreach ($topology["nodes"] as $idx => $n) {
                        $nodeNameToIdx[trim($n["name"])] = $idx;
                    }

                    $interfaceNetworkMap = [];
                    $links  = isset($topology["links"])  && is_array($topology["links"])  ? $topology["links"]  : [];
                    $clouds = isset($topology["cloud_networks"]) && is_array($topology["cloud_networks"]) ? $topology["cloud_networks"] : [];

                    foreach ($links as $link) {
                        $sN = trim($link["src_node"]);
                        $sI = trim($link["src_interface"]);
                        $dN = trim($link["dst_node"]);
                        $dI = trim($link["dst_interface"]);
                        $sK = "$sN:$sI";
                        $dK = "$dN:$dI";

                        if (isset($interfaceNetworkMap[$sK])) {
                            $interfaceNetworkMap[$dK] = $interfaceNetworkMap[$sK];
                        } elseif (isset($interfaceNetworkMap[$dK])) {
                            $interfaceNetworkMap[$sK] = $interfaceNetworkMap[$dK];
                        } else {
                            $netParams = [
                                "name"       => "Net-" . $sN . "_" . str_replace("/", "_", $sI),
                                "type"       => "bridge",
                                "visibility" => 0,
                                "left"       => 0,
                                "top"        => 0,
                            ];
                            $netResult = apiAddLabNetwork($lab, $netParams, false);
                            if ($netResult["status"] !== "success") {
                                throw new Exception("Cannot create bridge network for link $sN:$sI – $dN:$dI");
                            }
                            $netId = $netResult["data"]["id"];
                            $interfaceNetworkMap[$sK] = $netId;
                            $interfaceNetworkMap[$dK] = $netId;
                        }
                    }

                    foreach ($clouds as $cloud) {
                        $cloudParams = [
                            "name"       => isset($cloud["name"]) ? trim($cloud["name"]) : "Cloud",
                            "type"       => trim($cloud["type"]),
                            "visibility" => 1,
                            "icon"       => isset($cloud["icon"]) ? trim($cloud["icon"]) : "Cloud.png",
                            "left"       => isset($cloud["left"]) ? (int) $cloud["left"] : 0,
                            "top"        => isset($cloud["top"])  ? (int) $cloud["top"]  : 0,
                        ];
                        $cloudResult = apiAddLabNetwork($lab, $cloudParams, false);
                        if ($cloudResult["status"] !== "success") {
                            throw new Exception("Cannot create cloud network: " . $cloudParams["name"]);
                        }
                        $cloudId = $cloudResult["data"]["id"];
                        if (isset($cloud["connected_to"])) {
                            $cNode = trim($cloud["connected_to"]["node"]);
                            $cIf   = trim($cloud["connected_to"]["interface"]);
                            $interfaceNetworkMap["$cNode:$cIf"] = $cloudId;
                        }
                    }

                    $nodeNameToId = [];
                    foreach ($topology["nodes"] as $node) {
                        $nodeName = trim($node["name"]);
                        $nodeType = trim($node["type"]);
                        $nodeTemplate = trim($node["template"]);

                        $nodeParams = [
                            "name"     => $nodeName,
                            "type"     => $nodeType,
                            "template" => $nodeTemplate,
                            "image"    => isset($node["image"])    ? trim($node["image"])    : "",
                            "left"     => isset($node["left"])     ? (int) $node["left"]     : 0,
                            "top"      => isset($node["top"])      ? (int) $node["top"]      : 0,
                            "ethernet" => isset($node["ethernet"]) ? (int) $node["ethernet"] : 2,
                            "ram"      => isset($node["ram"])      ? (int) $node["ram"]      : 512,
                            "icon"     => isset($node["icon"])     ? trim($node["icon"])     : "",
                            "config"   => isset($node["config_data"]) && $node["config_data"] !== "" ? 1 : 0,
                        ];

                        $tplDefaults = getTemplateDefaults($nodeTemplate);
                        if ($tplDefaults) {
                            if (empty($nodeParams["image"]) && isset($tplDefaults["image"])) {
                                $nodeParams["image"] = (string) $tplDefaults["image"];
                            }
                            if (empty($nodeParams["icon"]) && isset($tplDefaults["icon"])) {
                                $nodeParams["icon"] = (string) $tplDefaults["icon"];
                            }
                            if (!isset($node["ram"]) && isset($tplDefaults["ram"])) {
                                $nodeParams["ram"] = (int) $tplDefaults["ram"];
                            }
                            if (!isset($node["ethernet"]) && isset($tplDefaults["ethernet"])) {
                                $nodeParams["ethernet"] = (int) $tplDefaults["ethernet"];
                            }
                        }

                        if ($nodeType === "iol") {
                            $nodeParams["serial"]   = isset($node["serial"])   ? (int) $node["serial"]   : 0;
                            $nodeParams["nvram"]    = isset($node["nvram"])    ? (int) $node["nvram"]    : 1024;
                            $nodeParams["keepalive"]= isset($node["keepalive"])? $node["keepalive"]      : 0;
                            if (empty($nodeParams["image"])) {
                                $isL2 = (stripos($nodeName, "sw") !== false || stripos($nodeTemplate, "l2") !== false);
                                $nodeParams["image"] = $isL2 ? "L2-ADVENTERPRISEK9-M-15.2-IRON-20151103.bin" : "L3-ADVENTERPRISEK9-M-15.4-2T.bin";
                            }
                        }

                        $addResult = apiAddLabNode($lab, $nodeParams, false);
                        if ($addResult["status"] !== "success") {
                            throw new Exception("Cannot add node \"$nodeName\": " . $addResult["message"]);
                        }
                        $nodeNameToId[$nodeName] = $addResult["data"]["id"];

                        if (!empty($node["config_data"])) {
                            $nId = $nodeNameToId[$nodeName];
                            $lab->setNodeConfigData($nId, (string) $node["config_data"]);
                        }
                    }

                    foreach ($interfaceNetworkMap as $key => $netId) {
                        list($nName, $ifName) = explode(":", $key, 2);
                        if (!isset($nodeNameToId[$nName])) continue;
                        $nId   = $nodeNameToId[$nName];
                        $nType = "";
                        foreach ($topology["nodes"] as $n) {
                            if (trim($n["name"]) === $nName) { $nType = trim($n["type"]); break; }
                        }

                        $targetIfId = null;
                        if (isset($lab->getNodes()[$nId])) {
                            $nodeObj = $lab->getNodes()[$nId];
                            foreach ($nodeObj->getInterfaces() as $currIfId => $currIfObj) {
                                if (strcasecmp($currIfObj->getName(), $ifName) === 0) {
                                    $targetIfId = $currIfId;
                                    break;
                                }
                            }
                        }
                        if ($targetIfId === null) {
                            $targetIfId = interfaceNameToId($ifName, $nType);
                        }
                        if ($targetIfId === null && is_numeric($ifName)) {
                            $targetIfId = (int) $ifName;
                        }
                        if ($targetIfId === null) continue;

                        $lab->connectNode($nId, [$targetIfId => $netId]);
                    }

                    $lab->save();

                    $nodeCount   = count($topology["nodes"]);
                    $linkCount   = count($links);
                    $cloudCount  = count($clouds);

                    $updNodes = apiGetLabNodes($lab, $user["html5"]);
                    $updNets  = apiGetLabNetworks($lab);
                    $output["code"]    = 201;
                    $output["status"]  = "success";
                    $output["message"] = "Topology imported: $nodeCount nodes, $linkCount links, $cloudCount clouds";
                    $output["data"] = [
                        "nodes"   => $nodeCount,
                        "links"   => $linkCount,
                        "clouds"  => $cloudCount,
                    ];
                    $output["update"] = [
                        "nodes"    => ($updNodes["status"] === "success") ? $updNodes["data"] : [],
                        "networks" => ($updNets["status"]  === "success") ? $updNets["data"]  : [],
                    ];

                } elseif ($action === "export") {
                    require_once BASE_DIR . "/html/includes/api_import_json.php";
                    $result = exportLabToJson($lab);
                    $output = $result;
                } elseif ($action === "check_images") {
                    require_once BASE_DIR . "/html/includes/api_import_json.php";
                    $topology = isset($variables["topology"]) && is_array($variables["topology"])
                        ? $variables["topology"]
                        : $variables;
                    $nodes = isset($topology["nodes"]) && is_array($topology["nodes"]) ? $topology["nodes"] : [];
                    $imageCheck = checkImagesAvailable($nodes);
                    $output["code"] = 200;
                    $output["status"] = "success";
                    $output["data"] = $imageCheck;
                } elseif ($action === "templates") {
                    $tplFile = BASE_DIR . "/html/templates/json/pnetlab_full_topology_template.json";
                    $tplData = file_exists($tplFile) ? json_decode(file_get_contents($tplFile), true) : [];
                    $output["code"] = 200;
                    $output["status"] = "success";
                    $output["data"] = $tplData;
                } else {
                    throw new Exception("Unknown topology_json action: $action");
                }
                break;
'''
    if match:
        content = content[:match.end()] + code_to_insert + content[match.end():]
        with open(api_file, "w", encoding="utf-8") as f:
            f.write(content)
        print("    -> Đã chèn case topology_json vào api.php thành công!")
    else:
        print("    [!] Không tìm thấy vị trí tự động trong api.php. Hãy kiểm tra thủ công.")
EOF

# 4. Chèn giao diện vào index.html, render.js, actions.js
echo "[4/5] Đang gắn giao diện vào thanh Sidebar và Menu..."

# index.html
python3 - << 'EOF'
idx_file = "/opt/unetlab/html/themes/default/index.html"
with open(idx_file, "r", encoding="utf-8") as f:
    c = f.read()

if "pnetlab-import-json.js" not in c:
    tag = '  <script src="/themes/default/js/pnetlab-import-json.js?v=2" defer></script>\n'
    if "</body>" in c:
        c = c.replace("</body>", tag + "</body>")
    else:
        c = c + "\n" + tag
    with open(idx_file, "w", encoding="utf-8") as f:
        f.write(c)
    print("    -> Đã thêm thẻ script vào index.html")
else:
    print("    -> Thẻ script đã có trong index.html, bỏ qua.")
EOF

# render.js
python3 - << 'EOF'
rnd_file = "/opt/unetlab/html/themes/default/js/functions/status/render.js"
try:
    with open(rnd_file, "r", encoding="utf-8") as f:
        c = f.read()
    if 'id="pnq-importjson"' not in c:
        target = "action-sdwan-builder"
        if target in c:
            replacement = 'action-sdwan-builder" href="javascript:void(0)" title="\' + lang(\'SDWAN Lab Builder\') + \'"><i class="fa fa-cloud"></i><span class="lab-sidebar-title">\' + lang(\'SDWAN Lab Builder\') + \'</span></a></li>\');\n    $(\'#lab-sidebar ul\').append(\'<li id="pnq-importjson"><a class="action-import-json" href="javascript:void(0)" title="\' + (typeof lang === \'function\' ? lang(\'Import JSON Topology\') : \'Import JSON Topology\') + \'"><i class="fa fa-sitemap"></i><span class="lab-sidebar-title">Import JSON Topology</span></a></li>\');'
            c = c.replace('action-sdwan-builder" href="javascript:void(0)" title="\' + lang(\'SDWAN Lab Builder\') + \'"><i class="fa fa-cloud"></i><span class="lab-sidebar-title">\' + lang(\'SDWAN Lab Builder\') + \'</span></a></li>\');', replacement)
            with open(rnd_file, "w", encoding="utf-8") as f:
                f.write(c)
            print("    -> Đã thêm nút Import JSON vào render.js")
except Exception as e:
    print(f"    [!] Bỏ qua render.js: {e}")
EOF

# actions.js
python3 - << 'EOF'
act_file = "/opt/unetlab/html/themes/default/js/actions.js"
try:
    with open(act_file, "r", encoding="utf-8") as f:
        c = f.read()
    if 'action-import-json' not in c:
        target = "action-lineadd"
        if target in c:
            c = c.replace("body += '<li><a class=\"action-lineadd\"", "body += '<li><a class=\"action-import-json\" href=\"javascript:void(0)\"><i class=\"fa fa-sitemap\"></i> ' + (typeof lang === 'function' ? lang('Import JSON Topology') : 'Import JSON Topology') + '</a></li>';\n    body += '<li><a class=\"action-lineadd\"")
            with open(act_file, "w", encoding="utf-8") as f:
                f.write(c)
            print("    -> Đã thêm lựa chọn vào menu Add Object trong actions.js")
except Exception as e:
    print(f"    [!] Bỏ qua actions.js: {e}")
EOF

# 5. Phân quyền www-data
echo "[5/5] Đang phân quyền cho www-data..."
chown -R www-data:www-data /opt/unetlab/html/
chmod -R 755 /opt/unetlab/html/themes/default/js/
systemctl restart apache2 2>/dev/null || systemctl restart nginx 2>/dev/null || true

echo "======================================================================"
echo "  HOÀN TẤT CÀI ĐẶT THÀNH CÔNG!"
echo "  Hãy mở trình duyệt và nhấn Ctrl + Shift + R để trải nghiệm."
echo "======================================================================"
