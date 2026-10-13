const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/visitor.controller');

router.post('/',                ctrl.checkIn);
router.get('/today',            ctrl.getToday);
router.patch('/:id/checkout',   ctrl.checkOut);

module.exports = router;
