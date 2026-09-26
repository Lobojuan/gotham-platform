<?php
/**
 * Plugin Name: Gotham Consult Platform Bridge
 * Description: Shows the Gotham Consult platform (website, registration, Family Desk, back office) on gothamconsult.com. WordPress admin keeps working at /wp-admin. Deactivate this plugin to bring the old WordPress site back.
 * Version: 1.0.0
 * Author: Carlson Capital Ltd
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;

const GC_BRIDGE_ORIGIN = 'https://gotham.84-12-73-59.sslip.io';   // the platform server
const GC_BRIDGE_KEY    = 'SET-ME';   // same value as PROXY_KEY in /srv/gotham/.env

/* WordPress's own addresses are never touched */
function gc_bridge_is_wordpress_path($path) {
  return (bool) preg_match('#^/(wp-admin|wp-login\.php|wp-json|wp-content|wp-includes|wp-cron\.php|xmlrpc\.php|wp-signup\.php|wp-activate\.php|wp-trackback\.php)(/|$|\?)#', $path);
}

add_action('plugins_loaded', function () {
  if (is_admin() || wp_doing_cron() || (defined('WP_CLI') && WP_CLI) || (defined('REST_REQUEST') && REST_REQUEST)) return;
  $uri  = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
  $path = parse_url($uri, PHP_URL_PATH) ?: '/';
  if (gc_bridge_is_wordpress_path($path)) return;
  if (strpos($path, '..') !== false || $path[0] !== '/') { status_header(400); exit; }

  /* big videos stream straight from the platform */
  if (preg_match('#\.(mp4|webm)$#i', $path)) { header('Location: ' . GC_BRIDGE_ORIGIN . $uri, true, 302); exit; }

  $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  $headers = array(
    'X-GC-Proxy-Key' => GC_BRIDGE_KEY,
    'X-GC-Client-IP' => $_SERVER['REMOTE_ADDR'] ?? '',
    'X-Forwarded-Host' => $_SERVER['HTTP_HOST'] ?? 'gothamconsult.com',
    'User-Agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'gotham-bridge',
    'Accept' => $_SERVER['HTTP_ACCEPT'] ?? '*/*',
    'Accept-Language' => $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '',
  );
  foreach (array('CONTENT_TYPE' => 'Content-Type', 'HTTP_IF_NONE_MATCH' => 'If-None-Match', 'HTTP_RANGE' => 'Range', 'HTTP_ORIGIN' => 'Origin', 'HTTP_REFERER' => 'Referer') as $k => $h) {
    if (!empty($_SERVER[$k])) $headers[$h] = $_SERVER[$k];
  }
  if (!empty($_COOKIE['gc_session'])) $headers['Cookie'] = 'gc_session=' . $_COOKIE['gc_session'];

  $args = array('method' => $method, 'headers' => $headers, 'timeout' => 45, 'redirection' => 0, 'decompress' => true, 'sslverify' => true);
  if (!in_array($method, array('GET', 'HEAD', 'OPTIONS'), true)) $args['body'] = file_get_contents('php://input');

  $r = wp_remote_request(GC_BRIDGE_ORIGIN . $uri, $args);
  if (is_wp_error($r)) {
    status_header(502); header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store');
    echo '<!doctype html><meta charset="utf-8"><title>Gotham Consult</title><div style="font:16px system-ui;max-width:520px;margin:15vh auto;padding:0 20px"><h1>We will be right back</h1><p>The site is being updated. Please try again in a minute, or WhatsApp +233 55 041 6627.</p></div>';
    exit;
  }
  $code = (int) wp_remote_retrieve_response_code($r);
  status_header($code);
  foreach (array('content-type', 'cache-control', 'etag', 'last-modified', 'content-disposition', 'x-frame-options', 'accept-ranges', 'content-range', 'vary', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods', 'access-control-allow-headers') as $h) {
    $v = wp_remote_retrieve_header($r, $h);
    if ($v !== '' && $v !== null) header(ucwords($h, '-') . ': ' . (is_array($v) ? implode(', ', $v) : $v), true);
  }
  $loc = wp_remote_retrieve_header($r, 'location');
  if ($loc) header('Location: ' . str_replace(GC_BRIDGE_ORIGIN, '', is_array($loc) ? $loc[0] : $loc), true, $code);
  /* the sign-in cookie belongs to gothamconsult.com now */
  $raw = $r['http_response'] ? $r['http_response']->get_response_object()->headers->getValues('set-cookie') : null;
  if ($raw) foreach ((array) $raw as $c) header('Set-Cookie: ' . $c, false);
  if (strpos($path, '/api/') === 0 || $path === '/admin' || strpos($path, '/admin/') === 0) {
    header('X-LiteSpeed-Cache-Control: no-cache'); header('Cache-Control: no-store', true);
  }
  header('X-Served-By: gotham-bridge');
  if ($method !== 'HEAD') echo wp_remote_retrieve_body($r);
  exit;
}, 0);
