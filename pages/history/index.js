const { modeOptions, typeOptions } = require('../../utils/constants');
const { deleteHistoryItem, saveHistoryItem } = require('../../utils/storage');
const { fetchEssayHistoryPage, fetchEssayHistoryDetail, deleteEssayHistoryItem, clearEssayHistory } = require('../../utils/request');
const { formatTime } = require('../../utils/format');

const statusOptions = [
  { id: 'all', label: '全部状态' },
  { id: 'SUCCESS', label: '成功' },
  { id: 'FAILED', label: '失败' }
];

Page({
  data: {
    modeOptions: [{ id: 'all', label: '全部模式' }].concat(modeOptions.map((item) => ({ id: item.id, label: item.label }))),
    essayTypeOptions: [{ id: 'all', label: '全部题型' }].concat(typeOptions.map((item) => ({ id: item.id, label: item.label }))),
    statusOptions,
    filterMode: 'all',
    filterEssayType: 'all',
    filterTaskStatus: 'all',
    history: [],
    loading: false,
    loadingMore: false,
    loadError: '',
    historyMode: 'local',
    offset: 0,
    pageSize: 10,
    hasMore: false
  },

  onShow() {
    return this.loadHistory(true);
  },

  async loadHistory(reset = false) {
    const filters = this.getFilters();
    const nextOffset = reset ? 0 : this.data.offset;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      loadError: '',
      ...(reset ? { history: [] } : {})
    });

    try {
      const page = await fetchEssayHistoryPage({
        offset: nextOffset,
        limit: this.data.pageSize,
        filters
      });
      const incoming = page.items.map((item) => ({
        ...item,
        displayTime: formatTime(item.createdAt)
      }));
      this.setData({
        history: reset ? incoming : this.data.history.concat(incoming),
        historyMode: page.sourceType || (incoming.some((item) => item.sourceType === 'remote') ? 'remote' : 'local'),
        offset: Number(page.nextOffset || 0),
        hasMore: !!page.hasMore,
        loading: false,
        loadingMore: false
      });
    } catch (error) {
      this.setData({
        ...(reset ? { history: [] } : {}),
        loadError: error.message || '历史记录加载失败',
        loading: false,
        loadingMore: false
      });
    }
  },

  async openItem(event) {
    const { id } = event.currentTarget.dataset;
    const target = this.data.history.find((item) => item.id === id);
    if (!target) {
      return;
    }

    let result = target;
    if (target.sourceType === 'remote' && !target.content) {
      wx.showLoading({
        title: '正在读取详情'
      });
      try {
        result = await fetchEssayHistoryDetail(id);
        saveHistoryItem(result);
      } catch (error) {
        wx.showToast({
          title: error.message || '读取详情失败',
          icon: 'none'
        });
        return;
      } finally {
        wx.hideLoading();
      }
    }

    const app = getApp();
    app.globalData.currentResult = result;
    wx.navigateTo({
      url: '/pages/report/index'
    });
  },

  removeItem(event) {
    const { id } = event.currentTarget.dataset;
    const target = this.data.history.find((item) => item.id === id);
    const sourceType = target ? target.sourceType || this.data.historyMode : this.data.historyMode;
    wx.showModal({
      title: '删除记录',
      content: sourceType === 'remote' ? '这条历史记录将从云端删除，并同步清掉本地缓存。' : '这条历史记录将从本地移除。',
      success: async (res) => {
        if (res.confirm) {
          try {
            if (sourceType === 'local') {
              deleteHistoryItem(id);
            } else {
              await deleteEssayHistoryItem(id, sourceType);
            }
            this.loadHistory(true);
          } catch (error) {
            wx.showToast({
              title: error.message || '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  removeAll() {
    const filters = this.getFilters();
    const hasFilter = Object.values(filters).some((value) => value && value !== 'all');
    wx.showModal({
      title: this.data.historyMode === 'remote' ? '清空云端历史' : '清空历史',
      content: this.data.historyMode === 'remote'
        ? (hasFilter ? '确认清空当前筛选结果对应的云端历史吗？' : '确认清空全部云端历史吗？')
        : (hasFilter ? '确认清空当前筛选结果对应的本地历史吗？' : '确认清空所有本地历史记录吗？'),
      success: async (res) => {
        if (res.confirm) {
          try {
            await clearEssayHistory(filters, this.data.historyMode);
            this.loadHistory(true);
          } catch (error) {
            wx.showToast({
              title: error.message || '清空失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  retryLoad() {
    this.loadHistory(true);
  },

  goWrite() {
    wx.navigateTo({ url: '/pages/write/index' });
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) {
      return;
    }
    this.loadHistory(false);
  },

  chooseFilterMode(event) {
    this.setData({
      filterMode: event.currentTarget.dataset.mode
    });
    this.loadHistory(true);
  },

  chooseFilterEssayType(event) {
    this.setData({
      filterEssayType: event.currentTarget.dataset.type
    });
    this.loadHistory(true);
  },

  chooseFilterTaskStatus(event) {
    this.setData({
      filterTaskStatus: event.currentTarget.dataset.status
    });
    this.loadHistory(true);
  },

  getFilters() {
    return {
      mode: this.data.filterMode,
      essayType: this.data.filterEssayType,
      taskStatus: this.data.filterTaskStatus
    };
  }
});
