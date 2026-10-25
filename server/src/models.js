import mongoose from 'mongoose';

const CaseSchema = new mongoose.Schema({
  title:{type:String,required:true}, summary:{type:String,required:true}, premise:{type:String,required:true}, settings:{type:mongoose.Schema.Types.Mixed,required:true}, incident:{type:mongoose.Schema.Types.Mixed,required:true}, suspects:{type:[mongoose.Schema.Types.Mixed],required:true}, timeline:{type:[mongoose.Schema.Types.Mixed],required:true}, evidence:{type:[mongoose.Schema.Types.Mixed],required:true}, solution:{type:mongoose.Schema.Types.Mixed,required:true,select:false}, status:{type:String,enum:['generating','playable','failed'],default:'generating',index:true}, generationMetadata:{type:mongoose.Schema.Types.Mixed}
},{timestamps:true});
CaseSchema.index({createdAt:-1});
const SessionSchema=new mongoose.Schema({caseId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},sessionTokenHash:{type:String,required:true,unique:true,select:false},notes:{type:[mongoose.Schema.Types.Mixed],default:[]},viewedEvidenceIds:{type:[String],default:[]},accusation:{type:mongoose.Schema.Types.Mixed,default:null},status:{type:String,enum:['in_progress','resolved'],default:'in_progress'},startedAt:{type:Date,default:Date.now},resolvedAt:{type:Date,default:null}},{timestamps:true});
SessionSchema.index({createdAt:1},{expireAfterSeconds:60*60*24*30});
export const MysteryCase=mongoose.model('MysteryCase',CaseSchema);
export const InvestigationSession=mongoose.model('InvestigationSession',SessionSchema);
