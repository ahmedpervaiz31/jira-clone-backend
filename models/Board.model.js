import mongoose from 'mongoose';


const boardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], 
  nextDisplayNumber: { type: Number, default: 0 },
});

boardSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Board', boardSchema);