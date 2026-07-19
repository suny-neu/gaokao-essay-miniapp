const { markdownToNodes } = require('../../utils/markdown');

Component({
  properties: {
    content: {
      type: String,
      value: ''
    }
  },
  observers: {
    content(value) {
      this.setData({
        nodes: markdownToNodes(value)
      });
    }
  },
  data: {
    nodes: []
  }
});
