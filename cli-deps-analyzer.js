#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const key = process.argv[i].slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
}

function validateArgs(args) {
  const errors = [];
  if (!args['package-name']) errors.push('--package-name обязателен');
  if (!args['repo']) errors.push('--repo обязателен');
  if (!args['repo-mode'] || !['clone', 'use-local'].includes(args['repo-mode'])) {
    errors.push('--repo-mode должен быть "clone" или "use-local"');
  }
  const maxDepth = args['max-depth'] !== undefined ? Number(args['max-depth']) : 10;
  if (isNaN(maxDepth) || maxDepth < 0 || !Number.isInteger(maxDepth)) {
    errors.push('--max-depth должен быть неотрицательным целым числом');
  }
  return {
    packageName: args['package-name'],
    repo: args['repo'],
    mode: args['repo-mode'],
    maxDepth: maxDepth,
    filter: args['filter'] || '',
    tree: args['tree'] === 'true' || args['tree'] === true
  };
}

function parseTestGraph(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
  const graph = {};
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [pkg, depsStr] = line.split(':').map(s => s.trim());
    if (pkg) {
      const deps = depsStr ? depsStr.split(/\s+/).filter(d => d) : [];
      graph[pkg] = deps;
    }
  });
  return graph;
}

function collectEdges(root, graph, maxDepth, filter) {
  const visited = new Set();
  const edges = new Set();
  const queue = [{ pkg: root, depth: 0, path: [root] }];
  while (queue.length > 0) {
    const { pkg, depth, path } = queue.shift();
    if (depth >= maxDepth) continue;
    if (filter && pkg.includes(filter)) continue;
    if (visited.has(pkg)) continue;
    visited.add(pkg);
    const deps = graph[pkg] || [];
    for (const dep of deps) {
      if (filter && dep.includes(filter)) continue;
      const newPath = [...path, dep];
      if (path.includes(dep)) continue; 
      edges.add(`${pkg} -> ${dep}`);
      queue.push({ pkg: dep, depth: depth + 1, path: newPath });
    }
  }
  return Array.from(edges);
}

function generateD2Graph(edges) {
  if (edges.length === 0) return '// Граф пуст\n';
  return edges.join('\n') + '\n';
}

function buildTree(root, graph, maxDepth, filter) {
  const visited = new Set();
  const queue = [{ pkg: root, depth: 0, path: [root] }];
  const nodeMap = new Map();
  while (queue.length > 0) {
    const { pkg, depth, path } = queue.shift();
    if (depth > maxDepth) continue;
    if (filter && pkg.includes(filter)) continue;
    if (visited.has(pkg)) continue;
    visited.add(pkg);
    if (!nodeMap.has(pkg)) nodeMap.set(pkg, { pkg, deps: [] });
    const deps = graph[pkg] || [];
    for (const dep of deps) {
      if (filter && dep.includes(filter)) continue;
      if (depth + 1 > maxDepth) continue;
      const newPath = [...path, dep];
      if (path.includes(dep)) continue;

      nodeMap.get(pkg).deps.push(dep);
      queue.push({ pkg: dep, depth: depth + 1, path: newPath });
    }
  }
  return { root, nodeMap };
}

function printTree(tree) {
  const { root, nodeMap } = tree;
  console.log(`\n ASCII-дерево для "${root}":`);
  function printNode(pkg, prefix = '') {
    console.log(`${prefix}├── ${pkg}`);
    const node = nodeMap.get(pkg);
    if (node && node.deps.length > 0) {
      node.deps.forEach((dep, i) => {
        const isLast = i === node.deps.length - 1;
        printNode(dep, prefix + (isLast ? '    ' : '│   '));
      });
    }
  }
  console.log(root);
  const rootNode = nodeMap.get(root);
  if (rootNode) {
    rootNode.deps.forEach((dep, i) => {
      const isLast = i === rootNode.deps.length - 1;
      printNode(dep, isLast ? '    ' : '│   ');
    });
  }
}

function main() {
  try {
    const config = validateArgs(args);
    console.log('Генерация визуализации графа зависимостей...');
    console.log('Параметры:', config);

    if (config.mode === 'use-local') {
      if (!fs.existsSync(config.repo)) {
        throw new Error(`Файл не найден: ${config.repo}`);
      }
      const graph = parseTestGraph(config.repo);
      const edges = collectEdges(config.packageName, graph, config.maxDepth, config.filter);
      const d2Code = generateD2Graph(edges);
      console.log('\n D2-диаграмма:');
      console.log(d2Code);
      if (config.tree) {
        const tree = buildTree(config.packageName, graph, config.maxDepth, config.filter);
        printTree(tree);
      }
      console.log('\n Сравнение с npm:');
      console.log('  - `npm ls` показывает дерево с версиями и может дублировать узлы при разных версиях.');
      console.log('  -  D2-граф — упрощённый (только имена), без версий, без дубликатов.');
      console.log('  - Циклы в npm разрешаются, но не отображаются явно; в D2 мы их опускаем.');
    } else {
      console.log('  Режим "clone" не поддерживается (репозиторий пуст).');
    }
  } catch (err) {
    console.error(' Ошибка:', err.message);
    process.exit(1);
  }
}

main();