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

  const maxDepth = args['max-depth'] !== undefined ? Number(args['max-depth']) : 3;
  if (isNaN(maxDepth) || maxDepth < 0 || !Number.isInteger(maxDepth)) {
    errors.push('--max-depth должен быть неотрицательным целым числом');
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return {
    packageName: args['package-name'],
    repo: args['repo'],
    mode: args['repo-mode'],
    maxDepth: maxDepth,
    filter: args['filter'] || ''
  };
}

function parseTestGraph(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
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

function buildDependencyGraph(root, graph, maxDepth, filter) {
  if (!graph[root]) {
    console.log(` Пакет "${root}" не найден в графе.`);
    return { tree: [], hasCycle: false };
  }
  const visited = new Set();
  const depthMap = new Map();
  const queue = [{ pkg: root, depth: 0, path: [root] }];
  const resultTree = [];
  let hasCycle = false;

  while (queue.length > 0) {
    const { pkg, depth, path } = queue.shift();

    if (depth > maxDepth) continue;
    if (filter && pkg.includes(filter)) continue;

    if (!visited.has(pkg)) {
      visited.add(pkg);
      depthMap.set(pkg, depth);
      resultTree.push({ pkg, depth, deps: [] });
    }

    const currentDeps = graph[pkg] || [];
    for (const dep of currentDeps) {
      if (filter && dep.includes(filter)) continue;
      if (depth + 1 > maxDepth) continue;

      const newPath = [...path, dep];
      if (path.includes(dep)) {
        hasCycle = true;
        console.warn(` Обнаружен цикл: ${newPath.join(' → ')}`);
        continue;
      }
      queue.push({ pkg: dep, depth: depth + 1, path: newPath });
      const parent = resultTree.find(n => n.pkg === pkg);
      if (parent && !parent.deps.includes(dep)) {
        parent.deps.push(dep);
      }
    }
  }

  return { tree: resultTree, hasCycle };
}

function printTree(tree, root) {
  const nodeMap = new Map(tree.map(n => [n.pkg, n]));
  console.log(`\n Граф зависимостей для "${root}":`);

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

  if (tree.length > 0) {
    console.log(root);
    const rootNode = nodeMap.get(root);
    if (rootNode) {
      rootNode.deps.forEach((dep, i) => {
        const isLast = i === rootNode.deps.length - 1;
        printNode(dep, isLast ? '    ' : '│   ');
      });
    }
  } else {
    console.log(' (Нет зависимостей в пределах глубины и фильтра)');
  }
}

function main() {
  try {
    const config = validateArgs(args);
    console.log('Запуск анализа зависимостей...');
    console.log('Параметры:', config);

    if (config.mode === 'use-local') {
      if (!fs.existsSync(config.repo)) {
        throw new Error(`Файл не найден: ${config.repo}`);
      }
      const graph = parseTestGraph(config.repo);
      console.log('\n Загружен тестовый граф:');
      Object.entries(graph).forEach(([pkg, deps]) => {
        console.log(`  ${pkg}: [${deps.join(', ')}]`);
      });
      const { tree, hasCycle } = buildDependencyGraph(
        config.packageName,
        graph,
        config.maxDepth,
        config.filter
      );
      printTree(tree, config.packageName);
      if (hasCycle) {
        console.log('\n Обнаружены циклические зависимости.');
      }
    } else {
      console.log('Режим "clone" временно не поддерживается (репозиторий пуст).');
    }
  } catch (err) {
    console.error(' Ошибка:', err.message);
    process.exit(1);
  }
}

main();