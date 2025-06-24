import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { GetAllAlertDto } from './dto/getAll-alert.dto';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { MailsService } from 'src/mails/mails.service';
import * as fs from 'fs';

@Injectable()
export class AlertsService {
  constructor(
    @Inject('PRODUCT_SERVICE')
    private readonly client: ClientProxy,
    private schedulerRegistry: SchedulerRegistry,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailsService,
  ) {}

  async create(createAlertDto: CreateAlertDto, userId: string) {
    const data = await lastValueFrom(
      this.client.send('createAlert', {
        ...createAlertDto,
        userId: userId,
      }),
    );
    // console.log(userId);
    const projectId = data.projectId;
    const status = data.status;
    if (status === 'active') {
      await this.addCronJobs(userId, projectId, '*/1 * * * *');
    } else {
      this.stopCronJob(projectId);
    }
    return data;
  }

  findAll(getAllAlertDto: GetAllAlertDto, userId: string) {
    return this.client.send('findAllAlerts', {
      ...getAllAlertDto,
      userId: userId,
    });
  }

  findOne(id: string) {
    return this.client.send('findOneAlert', id);
  }

  async update(id: string, updateAlertDto: UpdateAlertDto, userId: string) {
    const data = await lastValueFrom(
      this.client.send('updateAlert', {
        ...updateAlertDto,
        id,
      }),
    );

    const duration = data.duration;
    const durationdict = {
      '1 min': '* * * * *',
      '3 hour': '0 */3 * * *',
      '6 hour': '0 */6 * * *',
      '12 hour': '0 */12 * * *',
      '1 day': '0 1 * * *',
      week: '0 0 * * 0',
      month: '0 0 1 * *',
    };
    const time = durationdict[duration];
    const projectId = data.projectId;
    const status = data.status;
    // console.log(status)
    if (status === 'active') {
      try {
        await this.addCronJobs(userId, projectId, time);
      } catch (error) {
        console.log(error);
      }
    } else {
      this.stopCronJob(projectId);
    }
    return data;
  }

  remove(id: string) {
    return this.client.send('removeAlert', id);
  }

  async addCronJobs(userId: string, projectId: string, time: string) {
    const data = await this.userRepository.findOne({ where: { id: userId } });
    // console.log(data, userId);
    const email = data.email;
    try {
      const job1 = await this.schedulerRegistry.deleteCronJob(projectId);
    } catch (error) {
      console.log(error.message);
    } finally {
      const job = new CronJob(time, async () => {
        // fetch products from crwaler api and save in db
        //function which is update database and send alerts
        try {
          const alerts = await lastValueFrom(
            this.client.send('checkDataForAlerts', projectId),
          );
          // console.log(alerts);
          if (alerts.data.length > 0) {
            const replacements = await this.getReplacementValues(alerts);
            const htmlcontent = await this.makeHtml(replacements);
            // await this.writeHtml(htmlcontent);

            //Need For HTML Body Or Any Format
            const subject = 'SellerPundit product change Alert';
            await this.mailService.sendMail(email, subject, null, htmlcontent);
          }
        } catch (error) {
          console.log(error);
        }
      });

      await this.schedulerRegistry.addCronJob(projectId, job);
      job.start();

      console.log('cron job for alerts of project: ' + projectId + ' started');
    }
  }

  stopCronJob(projectId: string) {
    const job = this.schedulerRegistry.getCronJob(projectId);
    job.stop();

    console.log('cron job for alerts of project : ' + projectId + ' stopped');
  }

  async test(id: string) {
    // console.log(id);
    const alerts = await lastValueFrom(
      this.client.send('checkDataForAlerts', id),
    );
    const replacements = await this.getReplacementValues(alerts);
    // const htmlcontent = await this.updateHtml(replacements);
    const htmlcontent = await this.makeHtml(replacements);
    await this.writeHtml(htmlcontent);
    return alerts;
  }

  async writeHtml(content) {
    try {
      fs.writeFileSync(
        '/home/sunbots/KARAN/sellerpundit/sellerpundit-auth/src/alerts/new.html',
        content,
      );
    } catch (err) {
      console.log(err);
    }
  }

  async getReplacementValues(alerts) {
    if (alerts['data'].length > 0) {
      const last_checked = alerts.last_checked;
      const replacementArr = [];
      for await (const pro of alerts['data']) {
        const value = [];

        const product_name = pro['product']['title'];
        const last_changed = pro['last_changed'];
        const project_name = alerts['project_name'];
        const marketplace_name = pro['product']['marketplace_name'];

        const replacementsValues = {
          product_name: product_name,
          marketplace_name: marketplace_name,
          available: 'Yes',
          last_checked: new Date(last_checked),
          last_changed: new Date(last_changed),
        };

        // price
        const newprice = pro['newPrice'];
        if (newprice) {
          const oldprice = pro['product']['price'];
          const priceDifferencePercentage = pro['priceDifferencePercentage'];
          const currency = pro['product']['currency'];
          const price = {
            newValue: newprice + ' ' + currency,
            oldValue: oldprice + ' ' + currency,
            difference: priceDifferencePercentage,
          };
          value.push({ Price: price });
        }

        // rating
        const NewRating = pro['NewRating'];
        if (NewRating) {
          const oldrating = pro['product']['rating'];
          const RatingDiff = pro['ratingDiff'];
          const rating = {
            newValue: NewRating,
            oldValue: oldrating,
            difference: RatingDiff,
          };
          value.push({ Rating: rating });
        }

        // Rating count
        const NewRatingCount = pro['NewRatingCount'];
        if (NewRatingCount) {
          const oldratingcount = pro['product']['total_ratings'];
          const RatingCountDiff = pro['ratings_diff'];
          const total_ratings = {
            newValue: NewRatingCount,
            oldValue: oldratingcount,
            difference: RatingCountDiff,
          };
          value.push({ 'Total Ratings': total_ratings });
        }

        // Best seller Rank
        const newbsr = pro['newbsr'];
        if (newbsr) {
          const oldbsr = pro['product']['Bestsellerrank'];
          const bsrdiff = pro['bestsellerrankdiff'];
          const bestsellerrank = {
            newValue: newbsr,
            oldValue: oldbsr,
            difference: bsrdiff,
          };
          value.push({ 'Best Seller Rank': bestsellerrank });
        }
        replacementsValues['value'] = value;
        // console.log(replacementsValues);
        replacementArr.push(replacementsValues);
        // return replacementsValues;
      }
      return replacementArr;
    }
  }

  async makeHtml(replacementArr) {
    // static html with place holder
    const htmlstr1 = `<!DOCTYPE html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
    
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="x-apple-disable-message-reformatting">
      <title></title>
      
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500&display=swap" rel="stylesheet">
    
      <meta name="robots" content="noindex, follow">
    </head>
    
    <body width="100%" style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #fff; font-family: 'Open Sans', sans-serif;">
      <center style="width: 100%;">
        
        <div style="max-width: 1000px; margin: 0 auto;">
    
          <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
            style="margin: 10px auto;">
            <tr>
              <td valign="top" style="padding: 1em 2.5em; background: #f1f1f1;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="20%" style="text-align: left;">
              <div><img src="email/img/logo-left.png"></div>
                    </td>
                    <td width="60%" style="text-align: center;">
              <p style="font-size: 18px; font-weight: 500; color: #292929;">Sellerpundit has detected the changes. Please see the list of the products below</p>
                    </td>
             <td width="20%" style="text-align: right;">
                     <div><img src="email/img/right-logo.png"></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
        <tr>
          <td>
            <table>
              <tr>
                <td style="width:100%; height:10px; background-color:#ffff"></td>
              </tr>
            </table>
          </td>
                    </tr>`;
    const htmlstr4 = `<tr>
    <td>
      <table>
        <tr>
          <td style="width:100%; height:10px; background-color:#ffff"></td>
        </tr>
      </table>
    </td>
  </tr>
     
      <tr>
        <td valign="top" style="padding: 1em 2.5em; background: #f1f1f1; height: 200px">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
             
              <td width="100%" style="text-align: center;">
        <p style="font-size: 14px; font-weight: 500; color: #9b9b9b;">To Stop these email or change their frequency - please into your </br> account and change the email setting in account setting or <a href="#">Contact Us</a></p>
              </td>
       
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
  </div>
</center>


                    </body>`;
    let finalhtmlstr2 = '';
    // console.log(replacementArr);
    for await (const replacement of replacementArr) {
      const product_name = replacement['product_name'];
      const marketplace_name = replacement['marketplace_name'];
      const available = replacement['available'];
      const last_checked = replacement['last_checked'];
      const last_changed = replacement['last_changed'];
      const htmlstr2 = `<tr>
      <td>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="100%" style="text-align: left; padding: 1em 2.5em; background: #f1f1f1;">
          <div>
            <p style="font-weight:bold; color:#eb0000; margin:0"><span style="font-weight: normal;">Product: </span>${product_name}</p>
          </div>
                </td>
                
              </tr>
            </table>
      </td>
    </tr>
        <tr>
      <td>
      <table role="presentation" style="border-top:1px solid #b8b8b8" width="100%">
              <tr>
                <td width="100%" style="padding: 1em 2.5em; background: #f1f1f1;">
          <table width="100%">
            <tr>
              <th style="text-align:center; width:15%">MarketPlace</th>
              <th style="text-align:center; width:15%">factor</th>
              <th style="text-align:center; width:25%">change value</th>
              <th style="text-align:center; width:15%">Available</th>
              <th style="text-align:center; width:15%">Last Checked</th>
              <th style="text-align:center; width:15%">Last Change</th>
            </tr>
            
          </table>
                </td>
                
              </tr>
            </table>
      </td>
      </tr>`;
      finalhtmlstr2 = finalhtmlstr2 + htmlstr2;
      const values = replacement['value'];
      for await (const val of values) {
        const key = Object.keys(val)[0];
        const factor = key;
        const { newValue, oldValue, difference } = val[key];
        const state_arrow = difference > 0 ? '&#8593' : '&#8595';
        const color = difference > 0 ? '#023020' : '#FF0000';
        console.log(factor, newValue, oldValue, difference, state_arrow, color);
        const htmlstr3 = ` <tr>
        <td>
        <table role="presentation"  width="100%" style="border:0">
                <tr>
                  <td width="100%" style="padding: 1em 2.5em; background: #4fce7478;">
            <table width="100%">	
              <tr>
                <td style="text-align:center; width:15%"><a href="#">${marketplace_name}</a></td>
                <td style="text-align:center; width:15%">${factor}</td>
                <td style="text-align:center; width:25%;display: flex; justify-content: center; align-items: center; width: 100%; flex-wrap: wrap;">
                  <div>
                    <p style="margin-left: 35px; font-weight: 700">${newValue}</p>
                    <p style="margin-left: 0px; color: #5A5A5A; opacity: 0.9; margin-top: 0px;">was: ${oldValue}</p>
                  </div>
                  <div style="padding-inline-start: 20px;"><p style="color :${color} ; font-size:30px;">${state_arrow}</p></div>	
                  <div style="margin-top: 7px; padding-inline-start: 10px;">${difference}</div>
                </td>
                <td style="text-align:center; width:15%">${available}</td>
                <td style="text-align:center; width:15%">${last_checked}</td>
                <td style="text-align:center; width:15%">${last_changed}</td>	
              </tr>
            </table>
                  </td>
                  
                </tr>
              </table>
        </td>
      </tr>`;
        finalhtmlstr2 = finalhtmlstr2 + htmlstr3;
      }
    }

    const finalHtml = htmlstr1 + finalhtmlstr2 + htmlstr4;
    return finalHtml;
  }
}
