const express = require('express');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const c = require('../controllers/adminController');

const router = express.Router();

// Strict admin-only: every route below requires role 'admin'.
router.use(protect, authorize('admin'));

router.get('/stats', c.getStats);

router.get('/users', c.listUsers);
router.patch('/users/:id', c.updateUser);

router.get('/matches', c.listMatches);
router.get('/audit-logs', c.listAuditLogs);

router.get('/questions', c.listQuestionsAdmin);
router.post('/questions', c.createQuestion);
router.put('/questions/:id', c.updateQuestion);
router.delete('/questions/:id', c.deleteQuestion);

router.post('/categories', c.createCategory);
router.put('/categories/:id', c.updateCategory);
router.delete('/categories/:id', c.deleteCategory);

router.get('/config', c.getConfig);
router.patch('/config', c.updateConfig);

module.exports = router;
