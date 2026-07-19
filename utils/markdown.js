function markdownToNodes(markdownText) {
  const text = String(markdownText || '').replace(/\r/g, '');
  const lines = text.split('\n');
  const nodes = [];
  let inCodeBlock = false;
  let codeLines = [];

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        nodes.push(createCodeBlock(codeLines.join('\n')));
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      nodes.push({
        name: 'div',
        attrs: { style: getInlineStyle('md-space') },
        children: []
      });
      return;
    }

    if (line.startsWith('### ')) {
      nodes.push(createBlock('h3', 'md-h3', parseInline(line.slice(4))));
      return;
    }
    if (line.startsWith('## ')) {
      nodes.push(createBlock('h2', 'md-h2', parseInline(line.slice(3))));
      return;
    }
    if (line.startsWith('# ')) {
      nodes.push(createBlock('h1', 'md-h1', parseInline(line.slice(2))));
      return;
    }
    if (line.startsWith('- ')) {
      nodes.push(createBullet(line.slice(2)));
      return;
    }
    if (/^\d+\.\s/.test(line)) {
      const body = line.replace(/^\d+\.\s/, '');
      nodes.push(createBullet(body, true));
      return;
    }

    nodes.push(createBlock('p', 'md-p', parseInline(line)));
  });

  if (codeLines.length) {
    nodes.push(createCodeBlock(codeLines.join('\n')));
  }

  return nodes;
}

function createBlock(name, className, children) {
  return {
    name,
    attrs: {
      style: getInlineStyle(className)
    },
    children
  };
}

function createCodeBlock(text) {
  return {
    name: 'pre',
    attrs: {
      style: getInlineStyle('md-code')
    },
    children: [
      {
        type: 'text',
        text
      }
    ]
  };
}

function createBullet(text, ordered = false) {
  return {
    name: 'div',
    attrs: {
      style: getInlineStyle('md-li')
    },
    children: [
      {
        name: 'span',
        attrs: {
          style: getInlineStyle('md-li-mark')
        },
        children: [
          {
            type: 'text',
            text: ordered ? '1.' : '•'
          }
        ]
      },
      {
        name: 'span',
        attrs: {
          style: getInlineStyle('md-li-text')
        },
        children: parseInline(text)
      }
    ]
  };
}

function parseInline(line) {
  const children = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match = boldPattern.exec(line);

  while (match) {
    if (match.index > lastIndex) {
      children.push({
        type: 'text',
        text: line.slice(lastIndex, match.index)
      });
    }
    children.push({
      name: 'span',
      attrs: {
        style: getInlineStyle('md-strong')
      },
      children: [
        {
          type: 'text',
          text: match[1]
        }
      ]
    });
    lastIndex = match.index + match[0].length;
    match = boldPattern.exec(line);
  }

  if (lastIndex < line.length) {
    children.push({
      type: 'text',
      text: line.slice(lastIndex)
    });
  }

  if (!children.length) {
    children.push({
      type: 'text',
      text: line
    });
  }

  return children;
}

function getInlineStyle(token) {
  const styleMap = {
    'md-h1': 'margin: 20rpx 0 12rpx; font-size: 38rpx; font-weight: 700; color: #16252d;',
    'md-h2': 'margin: 18rpx 0 10rpx; font-size: 34rpx; font-weight: 700; color: #1b2c34;',
    'md-h3': 'margin: 16rpx 0 8rpx; font-size: 30rpx; font-weight: 700; color: #23343c;',
    'md-p': 'margin-bottom: 12rpx; color: #23333a; font-size: 28rpx; line-height: 1.7; white-space: pre-wrap;',
    'md-strong': 'font-weight: 700; color: #8f4c35;',
    'md-code': 'margin: 14rpx 0; padding: 20rpx; border-radius: 18rpx; background: #23272e; color: #f7efe5; font-size: 24rpx; line-height: 1.6; white-space: pre-wrap;',
    'md-li': 'display: flex; gap: 12rpx; margin-bottom: 12rpx;',
    'md-li-mark': 'width: 30rpx; color: #8e5138; font-size: 26rpx;',
    'md-li-text': 'flex: 1; color: #27363d; font-size: 28rpx; line-height: 1.7;',
    'md-space': 'height: 12rpx;'
  };

  return styleMap[token] || '';
}

module.exports = {
  markdownToNodes
};
