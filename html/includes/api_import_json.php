<?php
/**
 * html/includes/api_import_json.php
 *
 * Import a JSON topology definition and create a complete PNETLab .unl lab file.
 *
 * The JSON format is human-friendly: the user describes nodes by name, links by
 * interface names (e.g. "e0/0"), and cloud networks — this module translates
 * that into the internal XML format that PNETLab uses (networks with numeric IDs,
 * interface-to-network_id mappings, etc.).
 *
 * @author  PNETLab JSON Import Extension
 * @version 1.0.0
 */

/**
 * Validate the JSON topology structure and return errors.
 *
 * @param  array $json  Decoded JSON topology
 * @return array        Array of error strings (empty = valid)
 */
function validateTopologyJson($json, $requireLab = true)
{
    $errors = [];

    // Lab section (optional when importing into an existing open lab session)
    if ($requireLab) {
        if (!isset($json['lab']) || !is_array($json['lab'])) {
            $errors[] = 'Missing "lab" section';
        } elseif (!isset($json['lab']['name']) || trim($json['lab']['name']) === '') {
            $errors[] = 'Lab name is required in "lab.name"';
        }
    }

    // Nodes section
    if (!isset($json['nodes']) || !is_array($json['nodes']) || count($json['nodes']) === 0) {
        $errors[] = 'At least one node is required in "nodes" array';
        return $errors; // Can't validate further without nodes
    }

    $nodeNames = [];
    foreach ($json['nodes'] as $idx => $node) {
        $prefix = "nodes[$idx]";
        if (!isset($node['name']) || trim($node['name']) === '') {
            $errors[] = "$prefix: \"name\" is required";
        } else {
            $name = trim($node['name']);
            if (isset($nodeNames[$name])) {
                $errors[] = "$prefix: Duplicate node name \"$name\"";
            }
            $nodeNames[$name] = $idx;
        }

        if (!isset($node['type']) || trim($node['type']) === '') {
            $errors[] = "$prefix: \"type\" is required (iol, qemu, vpcs, docker)";
        }

        if (!isset($node['template']) || trim($node['template']) === '') {
            $errors[] = "$prefix: \"template\" is required";
        }

        // Image is required for non-vpcs types
        $type = isset($node['type']) ? trim($node['type']) : '';
        if ($type !== 'vpcs' && $type !== '') {
            if (!isset($node['image']) || trim($node['image']) === '') {
                $errors[] = "$prefix: \"image\" is required for type \"$type\"";
            }
        }
    }

    // Links section (optional but validate if present)
    if (isset($json['links']) && is_array($json['links'])) {
        foreach ($json['links'] as $idx => $link) {
            $prefix = "links[$idx]";
            if (!isset($link['src_node']) || trim($link['src_node']) === '') {
                $errors[] = "$prefix: \"src_node\" is required";
            } elseif (!isset($nodeNames[trim($link['src_node'])])) {
                $errors[] = "$prefix: src_node \"" . $link['src_node'] . "\" not found in nodes";
            }
            if (!isset($link['src_interface']) || trim($link['src_interface']) === '') {
                $errors[] = "$prefix: \"src_interface\" is required";
            }
            if (!isset($link['dst_node']) || trim($link['dst_node']) === '') {
                $errors[] = "$prefix: \"dst_node\" is required";
            } elseif (!isset($nodeNames[trim($link['dst_node'])])) {
                $errors[] = "$prefix: dst_node \"" . $link['dst_node'] . "\" not found in nodes";
            }
            if (!isset($link['dst_interface']) || trim($link['dst_interface']) === '') {
                $errors[] = "$prefix: \"dst_interface\" is required";
            }
        }
    }

    // Cloud networks (optional but validate if present)
    if (isset($json['cloud_networks']) && is_array($json['cloud_networks'])) {
        foreach ($json['cloud_networks'] as $idx => $cloud) {
            $prefix = "cloud_networks[$idx]";
            if (!isset($cloud['type']) || trim($cloud['type']) === '') {
                $errors[] = "$prefix: \"type\" is required (pnet0, pnet1, etc.)";
            }
            if (isset($cloud['connected_to'])) {
                $ct = $cloud['connected_to'];
                if (!isset($ct['node']) || !isset($nodeNames[trim($ct['node'])])) {
                    $errors[] = "$prefix: connected_to.node \"" . (isset($ct['node']) ? $ct['node'] : '') . "\" not found";
                }
                if (!isset($ct['interface']) || trim($ct['interface']) === '') {
                    $errors[] = "$prefix: connected_to.interface is required";
                }
            }
        }
    }

    return $errors;
}

/**
 * Check if all referenced images exist on the server.
 *
 * @param  array $nodes  Nodes array from JSON
 * @return array         ['missing' => [...], 'available' => [...]]
 */
function checkImagesAvailable($nodes)
{
    $missing = [];
    $available = [
        'iol' => [],
        'qemu' => [],
        'dynamips' => [],
        'docker' => [],
    ];

    // Scan available IOL images
    $iolDir = '/opt/unetlab/addons/iol/bin/';
    if (is_dir($iolDir)) {
        foreach (glob($iolDir . '*.bin') as $f) {
            $available['iol'][] = basename($f);
        }
    }

    // Scan available QEMU images
    $qemuDir = '/opt/unetlab/addons/qemu/';
    if (is_dir($qemuDir)) {
        foreach (scandir($qemuDir) as $d) {
            if ($d !== '.' && $d !== '..' && is_dir($qemuDir . $d)) {
                $available['qemu'][] = $d;
            }
        }
    }

    // Scan available Dynamips images
    $dynaDir = '/opt/unetlab/addons/dynamips/';
    if (is_dir($dynaDir)) {
        foreach (scandir($dynaDir) as $d) {
            if ($d !== '.' && $d !== '..' && is_file($dynaDir . $d)) {
                $available['dynamips'][] = $d;
            }
        }
    }

    // Scan available Docker images (if broker function is loaded)
    if (function_exists('broker_docker_image_ls')) {
        $resp = broker_docker_image_ls('refs');
        if (!empty($resp['ok']) && isset($resp['out']) && is_array($resp['out'])) {
            foreach ($resp['out'] as $img) {
                $img = trim($img);
                if ($img !== '') $available['docker'][] = $img;
            }
        }
    }

    foreach ($nodes as $node) {
        $type = isset($node['type']) ? trim($node['type']) : '';
        $template = isset($node['template']) ? trim($node['template']) : '';
        $image = isset($node['image']) ? trim($node['image']) : '';
        $nodeName = isset($node['name']) ? trim($node['name']) : 'Node';

        if ($type === 'vpcs') {
            continue; // VPCS doesn't need an image
        }

        // Auto-fill template default image if missing in node declaration
        if ($image === '' && $template !== '') {
            $tplDefaults = getTemplateDefaults($template);
            if ($tplDefaults && isset($tplDefaults['image'])) {
                $image = (string) $tplDefaults['image'];
            }
        }
        if ($image === '' && $type === 'iol') {
            $isL2 = (stripos($nodeName, 'sw') !== false || stripos($template, 'l2') !== false);
            $image = $isL2 ? 'L2-ADVENTERPRISEK9-M-15.2-IRON-20151103.bin' : 'L3-ADVENTERPRISEK9-M-15.4-2T.bin';
        }

        if ($image === '') {
            $missing[] = ['type' => $type, 'image' => '(chưa cấu hình image)', 'node' => $nodeName];
            continue;
        }

        if ($type === 'iol') {
            if (!file_exists($iolDir . $image)) {
                $missing[] = ['type' => 'iol', 'image' => $image, 'node' => $nodeName];
            }
        } elseif ($type === 'qemu') {
            if (!is_dir($qemuDir . $image)) {
                $missing[] = ['type' => 'qemu', 'image' => $image, 'node' => $nodeName];
            }
        } elseif ($type === 'dynamips') {
            if (!file_exists($dynaDir . $image)) {
                $missing[] = ['type' => 'dynamips', 'image' => $image, 'node' => $nodeName];
            }
        } elseif ($type === 'docker') {
            if (!empty($available['docker']) && !in_array($image, $available['docker'])) {
                $missing[] = ['type' => 'docker', 'image' => $image, 'node' => $nodeName];
            }
        }
    }

    return ['missing' => $missing, 'available' => $available];
}

/**
 * Check if a template exists.
 *
 * @param  string $template  Template name
 * @return bool
 */
function checkTemplateExists($template)
{
    $platform = defined('PLATFORM') ? PLATFORM : 'intel';
    $tplFile = '/opt/unetlab/html/templates/' . $platform . '/' . $template . '.yml';
    return file_exists($tplFile);
}

/**
 * Get template defaults from the YAML file.
 *
 * @param  string $template  Template name
 * @return array|null        Parsed YAML or null
 */
function getTemplateDefaults($template)
{
    $platform = defined('PLATFORM') ? PLATFORM : 'intel';
    $tplFile = '/opt/unetlab/html/templates/' . $platform . '/' . $template . '.yml';
    if (!file_exists($tplFile)) {
        return null;
    }
    return yaml_parse_file($tplFile);
}

/**
 * Convert interface name (e.g. "e0/0", "e0/1", "eth0") to numeric interface ID.
 *
 * IOL interface ID mapping:
 *   e0/0 = 0, e0/1 = 16, e0/2 = 32, e0/3 = 48
 *   e1/0 = 1, e1/1 = 17, e1/2 = 33, e1/3 = 49
 *   ...
 *
 * VPCS: eth0 = 0
 *
 * QEMU: eth0=0, eth1=1, eth2=2 ...
 *
 * @param  string $ifName   Interface name
 * @param  string $nodeType Node type (iol, qemu, vpcs)
 * @return int|null          Interface ID or null if invalid
 */
function interfaceNameToId($ifName, $nodeType)
{
    $ifName = trim($ifName);

    if ($nodeType === 'vpcs') {
        // VPCS: eth0 = 0
        if (preg_match('/^eth(\d+)$/i', $ifName, $m)) {
            return (int) $m[1];
        }
        return null;
    }

    if ($nodeType === 'iol') {
        // IOL: e{slot}/{port} or Ethernet{slot}/{port}
        // Interface ID = slot + (port * 16) for ethernet
        // Serial: s{slot}/{port}
        if (preg_match('/^(?:e|Ethernet\s*)(\d+)\/(\d+)$/i', $ifName, $m)) {
            $slot = (int) $m[1];
            $port = (int) $m[2];
            return $slot + ($port * 16);
        }
        if (preg_match('/^(?:s|Serial\s*)(\d+)\/(\d+)$/i', $ifName, $m)) {
            $slot = (int) $m[1];
            $port = (int) $m[2];
            return $slot + ($port * 16);
        }
        return null;
    }

    if ($nodeType === 'qemu' || $nodeType === 'docker') {
        // QEMU/Docker: eth0=0, eth1=1, Gi0=0, Gi1=1, etc.
        if (preg_match('/^(?:eth|Gi|Ethernet|e|Ge|fa|Fa)(\d+)$/i', $ifName, $m)) {
            return (int) $m[1];
        }
        // QEMU: GigabitEthernet0/0, etc. - more complex naming
        if (preg_match('/(\d+)(?:\/(\d+))?$/i', $ifName, $m)) {
            if (isset($m[2])) {
                return (int) $m[1] + ((int) $m[2] * 16);
            }
            return (int) $m[1];
        }
        return null;
    }

    return null;
}

/**
 * Auto-layout nodes when left/top coordinates are not provided.
 * Uses a simple grid layout with role-based vertical positioning.
 *
 * @param  array &$nodes  Nodes array (modified in place)
 */
function autoLayoutNodes(&$nodes)
{
    $needsLayout = [];
    foreach ($nodes as $idx => &$node) {
        if (!isset($node['left']) || !isset($node['top']) ||
            $node['left'] === '' || $node['top'] === '') {
            $needsLayout[] = $idx;
        }
    }
    unset($node);

    if (empty($needsLayout)) {
        return;
    }

    // Simple grid layout: 5 columns, 200px horizontal spacing
    $startLeft = 200;
    $startTop = 200;
    $colSpacing = 200;
    $rowSpacing = 180;
    $maxCols = 5;

    foreach ($needsLayout as $i => $idx) {
        $col = $i % $maxCols;
        $row = intdiv($i, $maxCols);
        $nodes[$idx]['left'] = $startLeft + ($col * $colSpacing);
        $nodes[$idx]['top'] = $startTop + ($row * $rowSpacing);
    }
}

/**
 * Main function: build a complete .unl topology from JSON.
 *
 * @param  array  $json    Decoded JSON topology
 * @param  string $path    Destination path (relative to BASE_LAB, e.g. "/")
 * @param  int    $tenant  Tenant/pod number
 * @param  string $email   User email for permissions
 * @return array           JSend response
 */
function buildTopologyFromJson($json, $path, $tenant, $email = '')
{
    // ── Step 0: Validate JSON ──────────────────────────────────────────
    $errors = validateTopologyJson($json);
    if (!empty($errors)) {
        return [
            'code' => 400,
            'status' => 'fail',
            'message' => 'JSON validation failed',
            'data' => ['errors' => $errors],
        ];
    }

    // ── Step 1: Check images ───────────────────────────────────────────
    $imageCheck = checkImagesAvailable($json['nodes']);
    if (!empty($imageCheck['missing'])) {
        $missingNames = array_unique(array_map(function($m) {
            return $m['image'];
        }, $imageCheck['missing']));
        $imgList = implode(', ', $missingNames);
        return [
            'code' => 400,
            'status' => 'fail',
            'message' => "Image {$imgList} hiện chưa có sẵn vui lòng tải hoặc thêm vào",
            'data' => [
                'missing_images' => $imageCheck['missing'],
                'available_images' => $imageCheck['available'],
            ],
        ];
    }

    // ── Step 2: Check templates ────────────────────────────────────────
    foreach ($json['nodes'] as $node) {
        $tpl = trim($node['template']);
        if (!checkTemplateExists($tpl)) {
            return [
                'code' => 400,
                'status' => 'fail',
                'message' => 'Template not found: "' . $tpl . '" for node "' . $node['name'] . '"',
                'data' => ['template' => $tpl, 'node' => $node['name']],
            ];
        }
    }

    // ── Step 3: Prepare lab metadata ───────────────────────────────────
    $labName = trim($json['lab']['name']);
    // Sanitize lab name for filename
    $labName = preg_replace('/[^a-zA-Z0-9_\-\. ]/', '', $labName);
    if ($labName === '') {
        $labName = 'Imported-Lab-' . date('YmdHis');
    }

    $labPath = rtrim($path, '/');
    if ($labPath === '') $labPath = '/';
    $labFile = ($labPath === '/')
        ? '/' . $labName . '.unl'
        : $labPath . '/' . $labName . '.unl';

    if (is_file(BASE_LAB . $labFile)) {
        return [
            'code' => 400,
            'status' => 'fail',
            'message' => 'Lab already exists: ' . $labName . '.unl',
        ];
    }

    // ── Step 4: Auto-layout if needed ──────────────────────────────────
    autoLayoutNodes($json['nodes']);

    // ── Step 5: Build node name → index mapping ────────────────────────
    $nodeNameToIdx = [];
    foreach ($json['nodes'] as $idx => $node) {
        $nodeNameToIdx[trim($node['name'])] = $idx;
    }

    // ── Step 6: Create networks from links ─────────────────────────────
    // Each point-to-point link creates a hidden bridge network.
    // Cloud networks create visible networks.
    $networks = [];
    $networkId = 1;

    // Map: "nodeName:ifName" → network_id (for interface binding)
    $interfaceNetworkMap = [];

    // Process point-to-point links
    $links = isset($json['links']) && is_array($json['links']) ? $json['links'] : [];
    foreach ($links as $link) {
        $srcNode = trim($link['src_node']);
        $srcIf = trim($link['src_interface']);
        $dstNode = trim($link['dst_node']);
        $dstIf = trim($link['dst_interface']);

        $srcKey = $srcNode . ':' . $srcIf;
        $dstKey = $dstNode . ':' . $dstIf;

        // Check if either interface is already in a network
        if (isset($interfaceNetworkMap[$srcKey])) {
            // Already connected, add dst to same network
            $netId = $interfaceNetworkMap[$srcKey];
            $interfaceNetworkMap[$dstKey] = $netId;
        } elseif (isset($interfaceNetworkMap[$dstKey])) {
            // Already connected, add src to same network
            $netId = $interfaceNetworkMap[$dstKey];
            $interfaceNetworkMap[$srcKey] = $netId;
        } else {
            // Create new bridge network
            $netName = 'Net-' . $srcNode . 'iface_' . str_replace('/', '_', $srcIf);
            $networks[$networkId] = [
                'id' => $networkId,
                'type' => 'bridge',
                'name' => $netName,
                'left' => '0',
                'top' => '0',
                'visibility' => '0',
                'icon' => 'lan.png',
                'smart' => '0',
                'vlan8021ad' => '0',
            ];
            $interfaceNetworkMap[$srcKey] = $networkId;
            $interfaceNetworkMap[$dstKey] = $networkId;
            $networkId++;
        }
    }

    // Process cloud networks
    $clouds = isset($json['cloud_networks']) && is_array($json['cloud_networks']) ? $json['cloud_networks'] : [];
    foreach ($clouds as $cloud) {
        $cloudName = isset($cloud['name']) ? trim($cloud['name']) : 'Cloud_' . $networkId;
        $cloudType = trim($cloud['type']);
        $cloudIcon = isset($cloud['icon']) ? trim($cloud['icon']) : 'Cloud.png';
        $cloudLeft = isset($cloud['left']) ? (string) $cloud['left'] : '0';
        $cloudTop = isset($cloud['top']) ? (string) $cloud['top'] : '0';

        $networks[$networkId] = [
            'id' => $networkId,
            'type' => $cloudType,
            'name' => $cloudName,
            'left' => $cloudLeft,
            'top' => $cloudTop,
            'visibility' => '1',
            'icon' => $cloudIcon,
            'smart' => '0',
            'vlan8021ad' => '0',
        ];

        // Connect node interface to this cloud network
        if (isset($cloud['connected_to'])) {
            $ctNode = trim($cloud['connected_to']['node']);
            $ctIf = trim($cloud['connected_to']['interface']);
            $interfaceNetworkMap[$ctNode . ':' . $ctIf] = $networkId;
        }

        $networkId++;
    }

    // ── Step 7: Build XML ──────────────────────────────────────────────
    $labId = sprintf(
        '%08x-%04x-%04x-%04x-%012x',
        mt_rand(0, 0xffffffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffffffffffff)
    );

    $xml = new SimpleXMLElement('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><lab></lab>');
    $xml->addAttribute('name', $labName);
    $xml->addAttribute('id', $labId);
    $xml->addAttribute('version', isset($json['lab']['version']) ? $json['lab']['version'] : '1');
    $xml->addAttribute('scripttimeout', '300');
    $xml->addAttribute('password', '');
    $xml->addAttribute('countdown', '');
    $xml->addAttribute('darkmode', isset($json['lab']['darkmode']) ? $json['lab']['darkmode'] : '1');
    $xml->addAttribute('mode3d', isset($json['lab']['mode3d']) ? $json['lab']['mode3d'] : '1');
    $xml->addAttribute('nogrid', isset($json['lab']['nogrid']) ? $json['lab']['nogrid'] : '0');

    // Permissions: admin-only by default (same as apiAddLab for admin user)
    $xml->addAttribute('joinable', '0');
    $xml->addAttribute('joinable_emails', '');
    $xml->addAttribute('openable', '0');
    $xml->addAttribute('openable_emails', '');
    $xml->addAttribute('editable', '0');
    $xml->addAttribute('editable_emails', '');
    $xml->addAttribute('multi_config_active', '');

    // Description
    if (isset($json['lab']['description'])) {
        $xml->addChild('description', htmlspecialchars($json['lab']['description'], ENT_XML1, 'UTF-8'));
    }
    // Author
    if (isset($json['lab']['author'])) {
        $xml->addAttribute('author', $json['lab']['author']);
    }

    // ── Add topology ───────────────────────────────────────────────────
    $topology = $xml->addChild('topology');

    // ── Add nodes ──────────────────────────────────────────────────────
    $nodesXml = $topology->addChild('nodes');

    foreach ($json['nodes'] as $idx => $node) {
        $nodeId = $idx + 1;
        $name = trim($node['name']);
        $type = trim($node['type']);
        $template = trim($node['template']);

        // Get template defaults
        $tplDefaults = getTemplateDefaults($template);

        $d = $nodesXml->addChild('node');
        $d->addAttribute('id', $nodeId);
        $d->addAttribute('type', $type);
        $d->addAttribute('template', $template);

        // Config
        $config = isset($node['config']) ? $node['config'] : '0';
        $d->addAttribute('config', $config);

        // Config data (startup config text)
        $configData = isset($node['config_data']) ? $node['config_data'] : '';
        $d->addAttribute('config_data', $configData);
        if ($configData !== '') {
            $d->addAttribute('config', '1');
        }

        $d->addAttribute('multi_config', 'W10=');
        $d->addAttribute('delay', '0');

        // Icon
        $defaultIcon = ($tplDefaults && isset($tplDefaults['icon'])) ? $tplDefaults['icon'] : 'Router.png';
        $icon = isset($node['icon']) ? trim($node['icon']) : $defaultIcon;
        $d->addAttribute('icon', $icon);

        $d->addAttribute('console', isset($node['console']) ? $node['console'] : '');

        // Image
        $image = isset($node['image']) ? trim($node['image']) : '';
        $d->addAttribute('image', $image);

        // Position
        $d->addAttribute('left', isset($node['left']) ? (string) $node['left'] : '0');
        $d->addAttribute('name', $name);
        $d->addAttribute('top', isset($node['top']) ? (string) $node['top'] : '0');
        $d->addAttribute('width', '');
        $d->addAttribute('size', '0');

        // Ethernet count
        $defaultEthernet = ($tplDefaults && isset($tplDefaults['ethernet'])) ? $tplDefaults['ethernet'] : 2;
        $ethernet = isset($node['ethernet']) ? (int) $node['ethernet'] : $defaultEthernet;
        $d->addAttribute('ethernet', (string) $ethernet);

        // RAM
        $defaultRam = ($tplDefaults && isset($tplDefaults['ram'])) ? $tplDefaults['ram'] : 512;
        $ram = isset($node['ram']) ? (int) $node['ram'] : $defaultRam;
        $d->addAttribute('ram', (string) $ram);

        // Standard attributes
        $d->addAttribute('mtu', isset($node['mtu']) ? (string) $node['mtu'] : '9000');
        $d->addAttribute('backspace', '127');
        $d->addAttribute('terminaltype', 'linux');
        $d->addAttribute('lock', '0');

        // Type-specific attributes
        if ($type === 'iol') {
            $d->addAttribute('iol_options', isset($node['iol_options']) ? $node['iol_options'] : '');
            $defaultKeepalive = ($tplDefaults && isset($tplDefaults['keepalive'])) ? $tplDefaults['keepalive'] : '0';
            $d->addAttribute('keepalive', isset($node['keepalive']) ? $node['keepalive'] : $defaultKeepalive);
            $d->addAttribute('Initial_startup_config', '');
            $serial = isset($node['serial']) ? (int) $node['serial'] : 0;
            $d->addAttribute('serial', (string) $serial);
            $defaultNvram = ($tplDefaults && isset($tplDefaults['nvram'])) ? $tplDefaults['nvram'] : 1024;
            $d->addAttribute('nvram', isset($node['nvram']) ? (string) $node['nvram'] : (string) $defaultNvram);
        }

        // ── Add interfaces connected to networks ───────────────────────
        // Build list of all interfaces for this node that are connected
        $nodeInterfaces = [];
        foreach ($interfaceNetworkMap as $key => $netId) {
            list($nodeName, $ifName) = explode(':', $key, 2);
            if ($nodeName === $name) {
                $ifId = interfaceNameToId($ifName, $type);
                if ($ifId !== null) {
                    $nodeInterfaces[$ifId] = [
                        'name' => $ifName,
                        'network_id' => $netId,
                    ];
                }
            }
        }

        // Sort by interface ID and add to XML
        ksort($nodeInterfaces);
        foreach ($nodeInterfaces as $ifId => $ifData) {
            $e = $d->addChild('interface');
            $e->addAttribute('id', (string) $ifId);
            $e->addAttribute('name', $ifData['name']);
            $e->addAttribute('type', 'ethernet');
            $e->addAttribute('network_id', (string) $ifData['network_id']);
            $e->addAttribute('vid', '1');
            $e->addAttribute('vlanmode', 'access');
            $e->addAttribute('vlans', '');
            // Link styling attributes (empty defaults)
            $e->addAttribute('style', '');
            $e->addAttribute('linkstyle', '');
            $e->addAttribute('color', '');
            $e->addAttribute('label', '');
            $e->addAttribute('linkcfg', '');
            $e->addAttribute('labelpos', '');
            $e->addAttribute('srcpos', '');
            $e->addAttribute('dstpos', '');
            $e->addAttribute('width', '');
            $e->addAttribute('fontsize', '');
            $e->addAttribute('curviness', '');
            $e->addAttribute('round', '');
        }
    }

    // ── Add networks ───────────────────────────────────────────────────
    if (!empty($networks)) {
        $networksXml = $topology->addChild('networks');
        foreach ($networks as $net) {
            $n = $networksXml->addChild('network');
            $n->addAttribute('id', (string) $net['id']);
            $n->addAttribute('type', $net['type']);
            $n->addAttribute('name', $net['name']);
            $n->addAttribute('left', $net['left']);
            $n->addAttribute('top', $net['top']);
            $n->addAttribute('visibility', $net['visibility']);
            $n->addAttribute('icon', $net['icon']);
            $n->addAttribute('size', '');
            $n->addAttribute('smart', $net['smart']);
            $n->addAttribute('vlan8021ad', $net['vlan8021ad']);
        }
    }

    // ── Step 8: Write .unl file ────────────────────────────────────────
    $destDir = BASE_LAB . $labPath;
    if (!is_dir($destDir)) {
        if (!mkdir($destDir, 0755, true)) {
            return [
                'code' => 500,
                'status' => 'fail',
                'message' => 'Could not create destination directory: ' . $labPath,
            ];
        }
    }

    $destFile = BASE_LAB . $labFile;

    // Pretty-print XML
    $dom = new DOMDocument('1.0', 'UTF-8');
    $dom->preserveWhiteSpace = false;
    $dom->formatOutput = true;
    $dom->loadXML($xml->asXML());
    $xmlString = $dom->saveXML();

    if (file_put_contents($destFile, $xmlString) === false) {
        return [
            'code' => 500,
            'status' => 'fail',
            'message' => 'Could not write lab file: ' . $labFile,
        ];
    }

    // Fix permissions
    chmod($destFile, 0644);

    // ── Step 9: Return success ─────────────────────────────────────────
    $nodeCount = count($json['nodes']);
    $linkCount = count($links);
    $cloudCount = count($clouds);
    $networkCount = count($networks);

    return [
        'code' => 201,
        'status' => 'success',
        'message' => "Topology imported successfully: $nodeCount nodes, $linkCount links, $cloudCount clouds, $networkCount networks",
        'data' => [
            'lab_path' => $labFile,
            'lab_name' => $labName,
            'lab_id' => $labId,
            'nodes' => $nodeCount,
            'links' => $linkCount,
            'networks' => $networkCount,
        ],
    ];
}

/**
 * Export an existing .unl lab to JSON topology format.
 *
 * @param  Lab    $lab  Lab object
 * @return array        JSend response with JSON topology in data
 */
function exportLabToJson($lab)
{
    $json = [
        'lab' => [
            'name' => $lab->getName(),
            'description' => $lab->getDescription(),
            'author' => $lab->getAuthor(),
            'version' => $lab->getVersion(),
        ],
        'nodes' => [],
        'links' => [],
        'cloud_networks' => [],
    ];

    $nodes = $lab->getNodes();
    $networks = $lab->getNetworks();

    // Build network_id → list of connected interfaces
    $networkConnections = []; // network_id => [ ['node_id'=>..., 'node_name'=>..., 'if_name'=>..., 'if_id'=>...], ... ]

    foreach ($nodes as $nodeId => $node) {
        $nodeData = [
            'name' => $node->getName(),
            'type' => $node->getNType(),
            'template' => $node->getTemplate(),
            'image' => $node->getImage(),
            'icon' => isset($node->getOptions()['icon']) ? $node->getOptions()['icon'] : '',
            'left' => isset($node->getOptions()['left']) ? (int) $node->getOptions()['left'] : 0,
            'top' => isset($node->getOptions()['top']) ? (int) $node->getOptions()['top'] : 0,
            'ethernet' => isset($node->getOptions()['ethernet']) ? (int) $node->getOptions()['ethernet'] : 2,
            'ram' => isset($node->getOptions()['ram']) ? (int) $node->getOptions()['ram'] : 512,
        ];
        $json['nodes'][] = $nodeData;

        // Collect interface connections
        foreach ($node->getEthernets() as $ifId => $iface) {
            $netId = $iface->getNetworkId();
            if ($netId > 0 && isset($networks[$netId])) {
                if (!isset($networkConnections[$netId])) {
                    $networkConnections[$netId] = [];
                }
                $networkConnections[$netId][] = [
                    'node_id' => $nodeId,
                    'node_name' => $node->getName(),
                    'if_name' => $iface->getName(),
                    'if_id' => $ifId,
                ];
            }
        }
    }

    // Convert network connections to links
    $processedNetworks = [];
    foreach ($networkConnections as $netId => $connections) {
        $network = $networks[$netId];
        $isCloud = false;
        $netType = $network->getNType();
        if (strpos($netType, 'pnet') !== false || $network->getVisibility() == 1) {
            $isCloud = true;
        }

        if ($isCloud) {
            // Cloud network
            $cloud = [
                'name' => $network->getName(),
                'type' => $netType,
                'icon' => $network->getIcon(),
                'left' => (int) $network->getLeft(),
                'top' => (int) $network->getTop(),
            ];
            if (!empty($connections)) {
                $cloud['connected_to'] = [
                    'node' => $connections[0]['node_name'],
                    'interface' => $connections[0]['if_name'],
                ];
            }
            $json['cloud_networks'][] = $cloud;
        } elseif (count($connections) >= 2) {
            // Point-to-point or multi-point link
            // For each pair of connections, create a link
            for ($i = 0; $i < count($connections); $i++) {
                for ($j = $i + 1; $j < count($connections); $j++) {
                    $json['links'][] = [
                        'src_node' => $connections[$i]['node_name'],
                        'src_interface' => $connections[$i]['if_name'],
                        'dst_node' => $connections[$j]['node_name'],
                        'dst_interface' => $connections[$j]['if_name'],
                    ];
                }
            }
        }
        $processedNetworks[$netId] = true;
    }

    return [
        'code' => 200,
        'status' => 'success',
        'message' => 'Lab exported to JSON format',
        'data' => $json,
    ];
}
