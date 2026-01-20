import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: { 
    type: String, 
    required: true,
    enum: ['to_do', 'in_progress', 'done'],
    default: 'to_do'
  },
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true }, 
  dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  assignedTo: { type: String },
  description: { type: String },
  dueDate: { type: String, default: null },
  displayId: { type: String },
  createdAt: { type: Date, default: Date.now }, 
  order: { type: String, required: true },
});

taskSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

taskSchema.index({ boardId: 1, status: 1, order: 1 }, { unique: true });

export default mongoose.model('Task', taskSchema);