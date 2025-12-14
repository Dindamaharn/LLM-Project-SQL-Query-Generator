import { ApiProperty } from '@nestjs/swagger';

export class RunQueryDto {
  @ApiProperty({
    example: 'Tampilkan jumlah pasien berdasarkan jenis kelamin',
    description: 'Pertanyaan dalam bahasa alami',
  })
  question: string;

  @ApiProperty({
    example: 'rsmu_db',
    description: 'Nama database rumah sakit',
  })
  dbName: string;
}
