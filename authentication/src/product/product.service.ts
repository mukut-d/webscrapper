import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateProductDto } from './dto/create-product.dto';
import { GetAllProductDto, GetAllSearchDto } from './dto/getAll-product.dto';
import { MoveDto } from './dto/move.dto';
import { StatusDto } from './dto/status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import * as XLSX from 'xlsx';
import * as html_to_pdf from 'html-pdf-node';
import { BulkCreate } from './dto/bulk-create.dto';
@Injectable()
export class ProductService {
  constructor(
    @Inject('PRODUCT_SERVICE') private readonly client: ClientProxy,
  ) {}

  create(createProductDto: CreateProductDto) {
    return this.client.send('createProduct', createProductDto);
  }

  findAll(
    getAllProductDto: GetAllProductDto,
    getAllSearchDto: GetAllSearchDto,
  ) {
    return this.client.send('findAllProducts', {
      ...getAllProductDto,
      ...getAllSearchDto,
    });
  }

  findOne(id: string, projectId: string) {
    return this.client.send('findOneProduct', { id: id, projectId: projectId });
  }

  update(id: string, updateProductDto: UpdateProductDto) {
    return this.client.send('updateProduct', { ...updateProductDto, id });
  }

  remove(ids: string[]) {
    return this.client.send('removeProduct', ids);
  }

  ownedProducts(ids: string[]) {
    return this.client.send('ownedProducts', ids);
  }

  getByCrawler(id: string) {
    return this.client.send('getByCrawler', id);
  }

  createBulk(bulCreate: BulkCreate) {
    return this.client.send('createBulkProduct', bulCreate);
  }

  updateStatus(id: string, statusDto: StatusDto) {
    return this.client.send('productStatusUpdate', { ...statusDto, id: id });
  }

  async exportProducts(exportProductDto: any) {
    return this.client.send('getDataInBatch', exportProductDto);
  }

  countProducts(projectId: string) {
    return this.client.send('countProducts', projectId);
  }

  moveOrCopyProduct(moveDto: MoveDto) {
    return this.client.send('moveOrCopyProduct', moveDto);
  }

  convertJsonToExcel(data: any) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    // return file buffer
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  convertExcelToCsv(data: any) {
    const wb = XLSX.read(data, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(ws);
    return csv;
  }

  convertExcelToHtml(data: any) {
    const wb = XLSX.read(data, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const html = XLSX.utils.sheet_to_html(ws);
    return html;
  }

  async convertHtmlToPdf(data: any) {
    try {
      // convert file buffer to string
      const html = data.toString('utf8');
      const style = ` <style>
      table,
      th,
      td {
        border: 1px solid black;
        border-collapse: collapse; 
        
      }
      tr{
        page-break-inside: avoid;
      }
      th,
      td {
        padding-top: 10px;
        padding-bottom: 20px;
        padding-left: 30px;
        padding-right: 40px;
      }
      </style>
      </head>`;

      const htmlarr = html.split('</head>');
      htmlarr.splice(1, 0, style);
      const newhtml = htmlarr.join('');

      return await html_to_pdf.generatePdf(
        { content: newhtml },
        {
          format: 'A2',
          margin: { top: '35px', left: '15px', right: '15px', bottom: '20px' },
        },
      );
    } catch (error) {
      console.log(error);
      return new ArrayBuffer(0);
    }
  }
}
